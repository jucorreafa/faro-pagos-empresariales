// ===========================================================================
// BANCO ANDINO SIMULADO  ·  Proyecto Faro (UIDE)  ·  [SIMULADO]
// Es el "core bancario": aquí vive el dinero de las personas y empresas.
// Dominio BIAN equivalente: Current Account / Savings Account + Party Data
// Management + (Open Banking) Customer Consent / Access.
// ===========================================================================
import crypto from 'node:crypto';
import {
  crearApp, crearPool, enTransaccion, Problema, sha256, iguales, rutasAdmin, arrancar,
} from './comun/base.js';

const pool = crearPool();
const app = await crearApp({
  nombre: 'banco-andino',
  titulo: 'Banco Andino Simulado',
  descripcion:
    'Core bancario simulado del proyecto Faro. Maneja cuentas, débitos y créditos idempotentes ' +
    'y expone una API de Open Banking basada en consentimientos. **Todo el dinero es ficticio.**',
  etiquetas: [
    { name: 'Banca en línea (demo)', description: 'Lo que ve el cliente en su app del banco' },
    { name: 'Movimientos (interno)', description: 'Usado por el BCE y por Faro con X-Internal-Key' },
    { name: 'Open Banking', description: 'S3: acceso de terceros con consentimiento del cliente' },
    { name: 'Operación', description: 'Salud, caos y reinicio' },
  ],
});
rutasAdmin(app);

const requiereInterno = async (req) => {
  if (!iguales(req.headers['x-internal-key'], process.env.INTERNAL_KEY || '')) {
    throw new Problema(401, 'NO_AUTORIZADO', 'Llave interna inválida',
      'Este endpoint solo lo usan el BCE y Faro con la cabecera X-Internal-Key.');
  }
};

const Movimiento = {
  type: 'object',
  required: ['cuenta', 'monto', 'referencia'],
  additionalProperties: false,
  properties: {
    cuenta: { type: 'string', minLength: 10, maxLength: 10, examples: ['2200000001'] },
    monto: { type: 'number', exclusiveMinimum: 0, maximum: 100000, examples: [25.5] },
    referencia: { type: 'string', minLength: 6, maxLength: 80, description: 'Hace idempotente al movimiento' },
    concepto: { type: 'string', maxLength: 140 },
    origen: { type: 'string', maxLength: 30 },
  },
};

// -------------------------------------------------------------------------
// Banca en línea (demo): lo que el alumno "empleado" ve desde su celular.
// -------------------------------------------------------------------------
app.get('/v1/banca/clientes', {
  schema: { tags: ['Banca en línea (demo)'], summary: 'Listado de clientes y cuentas de la demo' },
}, async () => {
  const { rows } = await pool.query(`
    select c.numero, c.tipo, c.saldo, cl.id as cliente, cl.nombre, cl.tipo as tipo_cliente, cl.equipo
      from banco.cuentas c join banco.clientes cl on cl.id = c.cliente_id
     order by cl.tipo, cl.nombre`);
  return rows;
});

app.get('/v1/banca/cuentas/:numero', {
  schema: {
    tags: ['Banca en línea (demo)'], summary: 'Saldo y últimos movimientos de una cuenta',
    params: { type: 'object', properties: { numero: { type: 'string' } } },
  },
}, async (req) => {
  const { rows: [cuenta] } = await pool.query(`
    select c.numero, c.tipo, c.moneda, c.saldo, cl.nombre, cl.equipo
      from banco.cuentas c join banco.clientes cl on cl.id = c.cliente_id where c.numero = $1`, [req.params.numero]);
  if (!cuenta) throw new Problema(404, 'CUENTA_NO_EXISTE', 'Cuenta no encontrada', `No existe la cuenta ${req.params.numero}.`);
  const { rows: movimientos } = await pool.query(`
    select tipo, monto, saldo_resultante, concepto, origen, referencia, creado
      from banco.movimientos where cuenta = $1 order by id desc limit 25`, [req.params.numero]);
  return { ...cuenta, movimientos };
});

// -------------------------------------------------------------------------
// Movimientos internos (los usan el BCE y Faro). IDEMPOTENTES por referencia.
// -------------------------------------------------------------------------
async function aplicarMovimiento(tipo, { cuenta, monto, referencia, concepto, origen }) {
  return enTransaccion(pool, async (db) => {
    // 1) Bloqueamos la fila de la cuenta: si llegan dos pedidos iguales al mismo
    //    tiempo, el segundo espera aquí hasta que el primero termine.
    const { rows: [c] } = await db.query(`select saldo from banco.cuentas where numero=$1 for update`, [cuenta]);
    if (!c) throw new Problema(404, 'CUENTA_NO_EXISTE', 'Cuenta no encontrada', `No existe la cuenta ${cuenta}.`, { iso: 'AC01' });
    // 2) ¿Ya se aplicó este mismo movimiento? -> devolvemos el resultado anterior.
    const previo = await db.query(
      `select id, saldo_resultante, monto from banco.movimientos where cuenta=$1 and tipo=$2 and referencia=$3`,
      [cuenta, tipo, referencia]);
    if (previo.rows[0]) {
      const p = previo.rows[0];
      if (Number(p.monto) !== Number(monto)) {
        throw new Problema(422, 'REFERENCIA_REUTILIZADA', 'Referencia ya usada con otro monto',
          `La referencia ${referencia} ya se usó con un monto de ${p.monto}.`);
      }
      return { movimientoId: p.id, saldo: p.saldo_resultante, repetido: true };
    }
    const nuevo = tipo === 'DEBITO' ? Number(c.saldo) - monto : Number(c.saldo) + monto;
    if (nuevo < 0) {
      throw new Problema(409, 'FONDOS_INSUFICIENTES', 'Fondos insuficientes',
        `La cuenta ${cuenta} no tiene saldo suficiente.`, { iso: 'AM04' });
    }
    await db.query(`update banco.cuentas set saldo=$2 where numero=$1`, [cuenta, nuevo]);
    const { rows: [m] } = await db.query(
      `insert into banco.movimientos (cuenta,tipo,monto,saldo_resultante,referencia,concepto,origen)
       values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [cuenta, tipo, monto, nuevo, referencia, concepto || null, origen || null]);
    return { movimientoId: m.id, saldo: nuevo, repetido: false };
  });
}

for (const [ruta, tipo] of [['debitos', 'DEBITO'], ['creditos', 'CREDITO']]) {
  app.post(`/v1/movimientos/${ruta}`, {
    preHandler: requiereInterno,
    schema: {
      tags: ['Movimientos (interno)'],
      summary: tipo === 'DEBITO' ? 'Debitar (sacar dinero de) una cuenta' : 'Acreditar (poner dinero en) una cuenta',
      description: 'Idempotente: si la misma referencia llega dos veces, el dinero se mueve una sola vez.',
      security: [{ Interno: [] }],
      body: Movimiento,
    },
  }, async (req, reply) => {
    const r = await aplicarMovimiento(tipo, req.body);
    if (r.repetido) reply.header('Idempotent-Replayed', 'true');
    return reply.status(r.repetido ? 200 : 201).send({ tipo, cuenta: req.body.cuenta, monto: req.body.monto, ...r });
  });
}

// -------------------------------------------------------------------------
// OPEN BANKING (S3): consentimiento -> autorización del cliente -> token
// -------------------------------------------------------------------------
app.post('/open-banking/v1/consentimientos', {
  preHandler: requiereInterno, // el tercero (Faro) se identifica ante el banco
  schema: {
    tags: ['Open Banking'], summary: '1. El tercero pide permiso para ver una cuenta',
    security: [{ Interno: [] }],
    body: {
      type: 'object', required: ['cuenta', 'permisos', 'tercero'], additionalProperties: false,
      properties: {
        cuenta: { type: 'string' },
        tercero: { type: 'string', examples: ['FARO'] },
        permisos: { type: 'array', minItems: 1, items: { enum: ['SALDO', 'MOVIMIENTOS'] } },
        diasVigencia: { type: 'integer', minimum: 1, maximum: 90, default: 90 },
      },
    },
  },
}, async (req, reply) => {
  const { cuenta, tercero, permisos, diasVigencia = 90 } = req.body;
  const existe = await pool.query('select 1 from banco.cuentas where numero=$1', [cuenta]);
  if (!existe.rowCount) throw new Problema(404, 'CUENTA_NO_EXISTE', 'Cuenta no encontrada', `No existe la cuenta ${cuenta}.`);
  const { rows: [c] } = await pool.query(
    `insert into banco.consentimientos (tercero,cuenta,permisos,expira)
     values ($1,$2,$3, now() + make_interval(days => $4)) returning id, estado, expira`,
    [tercero, cuenta, permisos, diasVigencia]);
  return reply.status(201).send({
    ...c, cuenta, tercero, permisos,
    siguientePaso: 'El cliente debe autorizar en la pantalla de su banco (POST .../autorizar).',
  });
});

app.get('/open-banking/v1/consentimientos/:id', {
  schema: { tags: ['Open Banking'], summary: 'Ver un consentimiento (lo que el cliente va a autorizar)' },
}, async (req) => {
  const { rows: [c] } = await pool.query(
    `select c.id, c.tercero, c.cuenta, c.permisos, c.estado, c.expira, c.creado, cl.nombre as titular
       from banco.consentimientos c join banco.cuentas cu on cu.numero=c.cuenta
       join banco.clientes cl on cl.id=cu.cliente_id where c.id=$1`, [req.params.id]).catch(() => ({ rows: [] }));
  if (!c) throw new Problema(404, 'CONSENTIMIENTO_NO_EXISTE', 'Consentimiento no encontrado', 'Revise el identificador.');
  return c;
});

app.post('/open-banking/v1/consentimientos/:id/autorizar', {
  schema: {
    tags: ['Open Banking'], summary: '2. El cliente aprueba o rechaza (pantalla del banco)',
    description: '[SIMULADO] En la vida real el cliente entra con su usuario y clave del banco (OAuth 2.0). Aquí se simula ese paso.',
    body: { type: 'object', properties: { aprobar: { type: 'boolean', default: true } }, additionalProperties: false },
  },
}, async (req) => {
  const aprobar = req.body?.aprobar !== false;
  const token = aprobar ? `ob_${crypto.randomBytes(24).toString('base64url')}` : null;
  const { rows: [c] } = await pool.query(
    `update banco.consentimientos
        set estado = $2, token_hash = $3, autorizado = now()
      where id = $1 and estado = 'PENDIENTE' returning id, estado, expira, cuenta, permisos`,
    [req.params.id, aprobar ? 'AUTORIZADO' : 'RECHAZADO', token ? sha256(token) : null]).catch(() => ({ rows: [] }));
  if (!c) throw new Problema(409, 'CONSENTIMIENTO_NO_PENDIENTE', 'No se puede autorizar', 'El consentimiento no existe o ya fue resuelto.');
  // El token se entrega UNA sola vez; el banco solo guarda su huella.
  return { ...c, tokenAcceso: token };
});

app.delete('/open-banking/v1/consentimientos/:id', {
  schema: { tags: ['Open Banking'], summary: '4. El cliente revoca el permiso cuando quiera' },
}, async (req) => {
  const { rowCount } = await pool.query(
    `update banco.consentimientos set estado='REVOCADO' where id=$1 and estado='AUTORIZADO'`, [req.params.id]).catch(() => ({ rowCount: 0 }));
  if (!rowCount) throw new Problema(409, 'NO_REVOCABLE', 'No se puede revocar', 'El consentimiento no está autorizado.');
  return { id: req.params.id, estado: 'REVOCADO' };
});

app.get('/open-banking/v1/cuentas/:numero/saldo', {
  schema: {
    tags: ['Open Banking'], summary: '3. El tercero consulta el saldo con el token',
    security: [{ Bearer: [] }],
  },
}, async (req) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new Problema(401, 'SIN_TOKEN', 'Falta el token', 'Envíe Authorization: Bearer <token de consentimiento>.');
  const { rows: [c] } = await pool.query(
    `select * from banco.consentimientos where token_hash=$1`, [sha256(token)]);
  if (!c) throw new Problema(401, 'TOKEN_INVALIDO', 'Token inválido', 'El token no corresponde a ningún consentimiento.');
  if (c.estado !== 'AUTORIZADO') throw new Problema(403, 'CONSENTIMIENTO_' + c.estado, 'Consentimiento no vigente', `El consentimiento está ${c.estado}.`);
  if (new Date(c.expira) < new Date()) throw new Problema(403, 'CONSENTIMIENTO_EXPIRADO', 'Consentimiento expirado', 'Pida un nuevo consentimiento.');
  if (c.cuenta !== req.params.numero) throw new Problema(403, 'FUERA_DE_ALCANCE', 'Cuenta no autorizada', 'El consentimiento no cubre esta cuenta.');
  if (!c.permisos.includes('SALDO')) throw new Problema(403, 'PERMISO_FALTANTE', 'Permiso faltante', 'El consentimiento no incluye SALDO.');
  const { rows: [cta] } = await pool.query(`select numero, moneda, saldo from banco.cuentas where numero=$1`, [c.cuenta]);
  return { ...cta, consultadoPor: c.tercero, consentimiento: c.id, fecha: new Date().toISOString() };
});

app.get('/listo', { schema: { tags: ['Operación'], summary: 'Readiness: ¿puede atender? (verifica la base de datos)' } }, async () => {
  await pool.query('select 1');
  return { listo: true };
});

await arrancar(app);
