// ===========================================================================
// FARO-BCE  ·  Banco Central del Ecuador SIMULADO  ·  [SIMULADO]
// Sistema de pagos interbancarios: recibe órdenes de transferencia de los
// participantes (bancos, Faro y los 4 equipos del curso), verifica la
// idempotencia, liquida entre cuentas de liquidación y avisa al destino.
// Dominio BIAN equivalente: Payment Execution + Correspondent Bank /
// Clearing and Settlement ("Payment Order" -> "Payment Execution").
// ===========================================================================
import crypto from 'node:crypto';
import {
  crearApp, crearPool, enTransaccion, Problema, sha256, rutasAdmin, arrancar, caos,
} from './comun/base.js';
import { cache } from './cache.js';
import { pacs008Xml, pacs002Xml, MOTIVOS } from './iso20022.js';

const pool = crearPool();
const BANCO_ANDINO_URL = (process.env.BANCO_ANDINO_URL || 'http://localhost:8102').replace(/\/$/, '');
const TTL_IDEMPOTENCIA = 24 * 60 * 60; // 24 horas, como Stripe
const PATRON_LLAVE = /^[A-Za-z0-9_\-:.]{8,80}$/;

const app = await crearApp({
  nombre: 'bce',
  titulo: 'BCE Simulado · Faro',
  descripcion: `
**Banco Central del Ecuador SIMULADO** para el curso *Arquitectura para Plataformas Fintech* (UIDE).
Todo el dinero es ficticio.

### Cómo enviar una transferencia
1. Autentíquese con su llave en la cabecera **X-Api-Key** (botón *Authorize*).
2. Envíe una **Idempotency-Key** única por cada pago (por ejemplo un UUID). Si reintenta el **mismo** pago,
   use la **misma** llave: el BCE no cobrará dos veces y le devolverá la misma respuesta.
3. El cuerpo es un **pacs.008 simplificado** (ISO 20022) en JSON. La respuesta es un **pacs.002** (estado):
   \`ACSC\` = liquidada, \`RJCT\` = rechazada (con código de motivo).

### Participantes
BAS (Banco Andino Simulado), FARO, BILLETERA, NEXOCREDIT, REMESAS, AGROANTICIPO.
`,
  etiquetas: [
    { name: 'Transferencias', description: 'Enviar y consultar órdenes de pago' },
    { name: 'Participantes', description: 'Su conexión con el BCE y su webhook' },
    { name: 'Tablero público', description: 'Lo que se proyecta en clase' },
    { name: 'Operación', description: 'Salud, caos y reinicio' },
  ],
});
rutasAdmin(app);

// ---------------------------------------------------------------- utilidades
async function registrarEvento(tipo, participante, detalle = {}) {
  await pool.query(`insert into bce.eventos (tipo, participante, detalle) values ($1,$2,$3)`,
    [tipo, participante, detalle]).catch(() => {});
}

/** JSON canónico (claves ordenadas) para comparar cuerpos sin importar el orden. */
function canonico(v) {
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonico(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

async function autenticar(req) {
  const llave = req.headers['x-api-key'];
  if (!llave) {
    throw new Problema(401, 'SIN_API_KEY', 'Falta la llave del participante',
      'Envíe su llave en la cabecera X-Api-Key. La entrega el docente a cada equipo.');
  }
  const { rows: [p] } = await pool.query(
    `update bce.participantes set ultima_conexion = now() where api_key_hash = $1 and activo returning codigo, nombre, tipo`,
    [sha256(llave)]);
  if (!p) {
    await registrarEvento('LLAVE_API_INVALIDA', null, { ip: req.ip });
    throw new Problema(401, 'API_KEY_INVALIDA', 'Llave inválida', 'La llave X-Api-Key no corresponde a ningún participante activo.');
  }
  req.participante = p;
}

function respuestaPacs002(t) {
  return {
    transferenciaId: t.id,
    OrgnlMsgId: t.msg_id,
    OrgnlEndToEndId: t.end_to_end_id,
    TxSts: t.estado,
    estadoTexto: { ACSC: 'Liquidada', RJCT: 'Rechazada', PDNG: 'Pendiente' }[t.estado],
    StsRsnInf: t.motivo_codigo ? { Cd: t.motivo_codigo, AddtlInf: t.motivo_texto } : null,
    participanteOrigen: t.participante_origen,
    participanteDestino: t.participante_destino,
    monto: Number(t.monto),
    moneda: t.moneda,
    creado: t.creado,
    liquidado: t.liquidado,
    iso20022: { pacs008: `/v1/transferencias/${t.id}/iso20022?mensaje=pacs008`, pacs002: `/v1/transferencias/${t.id}/iso20022?mensaje=pacs002` },
  };
}

/** Acredita al cliente final en el banco destino (solo BAS es un banco con core). */
async function acreditarEnBancoAndino(transferenciaId, cuenta, monto, concepto, origen, correlationId) {
  const ctrl = AbortSignal.timeout(Number(process.env.TIMEOUT_BANCO_MS || 6000));
  try {
    const r = await fetch(`${BANCO_ANDINO_URL}/v1/movimientos/creditos`, {
      method: 'POST',
      signal: ctrl,
      headers: {
        'content-type': 'application/json',
        'x-internal-key': process.env.INTERNAL_KEY || '',
        'x-correlation-id': correlationId,
      },
      body: JSON.stringify({ cuenta, monto, referencia: `BCE-${transferenciaId}`, concepto, origen: `BCE/${origen}` }),
    });
    if (r.ok) return { ok: true };
    const err = await r.json().catch(() => ({}));
    if (r.status === 404) return { ok: false, codigo: 'AC01' };
    return { ok: false, codigo: 'AB05', detalle: err.title || `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, codigo: 'AB05', detalle: e.name === 'TimeoutError' ? 'tiempo de espera agotado' : e.message };
  }
}

/** Aviso al participante destino (equipos del curso) por webhook. No bloquea la liquidación. */
async function notificarWebhook(destino, t) {
  const { rows: [p] } = await pool.query(`select webhook_url from bce.participantes where codigo=$1`, [destino]);
  if (!p?.webhook_url) return;
  try {
    const r = await fetch(p.webhook_url, {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
      headers: { 'content-type': 'application/json', 'x-bce-evento': 'transferencia.recibida' },
      body: JSON.stringify({ evento: 'transferencia.recibida', ...respuestaPacs002(t), acreedorCuenta: t.acreedor_cuenta, acreedorNombre: t.acreedor_nombre, concepto: t.concepto }),
    });
    await registrarEvento(r.ok ? 'WEBHOOK_ENTREGADO' : 'WEBHOOK_FALLIDO', destino, { transferenciaId: t.id, http: r.status });
  } catch (e) {
    await registrarEvento('WEBHOOK_FALLIDO', destino, { transferenciaId: t.id, error: e.message });
  }
}

// ---------------------------------------------------------------- contrato
const Pacs008 = {
  type: 'object',
  required: ['GrpHdr', 'CdtTrfTxInf'],
  additionalProperties: false,
  examples: [{
    GrpHdr: { MsgId: 'MSG-20261013-0001', CreDtTm: '2026-10-13T16:05:00-05:00', NbOfTxs: 1 },
    CdtTrfTxInf: {
      PmtId: { EndToEndId: 'E2E-0001' },
      IntrBkSttlmAmt: { Ccy: 'USD', Amt: 12.5 },
      DbtrAgt: { Id: 'REMESAS' }, Dbtr: { Nm: 'Cliente de Remesas' }, DbtrAcct: { Id: 'REMESAS-0001' },
      CdtrAgt: { Id: 'BAS' }, Cdtr: { Nm: 'Cuenta demo de clase' }, CdtrAcct: { Id: '2200009999' },
      RmtInf: { Ustrd: 'Prueba de conexión' },
    },
  }],
  properties: {
    GrpHdr: {
      type: 'object', required: ['MsgId', 'CreDtTm', 'NbOfTxs'], additionalProperties: false,
      properties: {
        MsgId: { type: 'string', minLength: 1, maxLength: 35, description: 'Id único del mensaje' },
        CreDtTm: { type: 'string', format: 'date-time' },
        NbOfTxs: { type: 'integer', const: 1, description: 'Este BCE simulado acepta 1 transacción por mensaje' },
      },
    },
    CdtTrfTxInf: {
      type: 'object',
      required: ['PmtId', 'IntrBkSttlmAmt', 'DbtrAgt', 'Dbtr', 'DbtrAcct', 'CdtrAgt', 'Cdtr', 'CdtrAcct'],
      additionalProperties: false,
      properties: {
        PmtId: { type: 'object', required: ['EndToEndId'], additionalProperties: false, properties: { EndToEndId: { type: 'string', minLength: 1, maxLength: 35 } } },
        IntrBkSttlmAmt: {
          type: 'object', required: ['Ccy', 'Amt'], additionalProperties: false,
          properties: { Ccy: { type: 'string', const: 'USD' }, Amt: { type: 'number', exclusiveMinimum: 0, maximum: 50000 } },
        },
        DbtrAgt: { type: 'object', required: ['Id'], additionalProperties: false, properties: { Id: { type: 'string', description: 'Código del participante que ordena (debe ser el suyo)' } } },
        Dbtr: { type: 'object', required: ['Nm'], additionalProperties: false, properties: { Nm: { type: 'string', minLength: 1, maxLength: 140 } } },
        DbtrAcct: { type: 'object', required: ['Id'], additionalProperties: false, properties: { Id: { type: 'string', minLength: 1, maxLength: 34 } } },
        CdtrAgt: { type: 'object', required: ['Id'], additionalProperties: false, properties: { Id: { type: 'string', description: 'Código del participante que recibe' } } },
        Cdtr: { type: 'object', required: ['Nm'], additionalProperties: false, properties: { Nm: { type: 'string', minLength: 1, maxLength: 140 } } },
        CdtrAcct: { type: 'object', required: ['Id'], additionalProperties: false, properties: { Id: { type: 'string', minLength: 1, maxLength: 34 } } },
        RmtInf: { type: 'object', additionalProperties: false, properties: { Ustrd: { type: 'string', maxLength: 140 } } },
      },
    },
  },
};

// ---------------------------------------------------------------- transferencias
app.post('/v1/transferencias', {
  preHandler: autenticar,
  schema: {
    tags: ['Transferencias'],
    summary: 'Enviar una transferencia (pacs.008) — requiere Idempotency-Key',
    security: [{ ApiKey: [] }],
    headers: {
      type: 'object',
      required: ['idempotency-key'],
      properties: { 'idempotency-key': { type: 'string', description: 'Única por pago. Reintentos = misma llave.', examples: ['pago-remesas-0001'] } },
    },
    body: Pacs008,
  },
  // La llave se valida a mano para dar un mensaje didáctico (no el genérico de validación).
  attachValidation: true,
}, async (req, reply) => {
  const p = req.participante;
  const llave = req.headers['idempotency-key'];

  // 1) ¿Trae Idempotency-Key? ---------------------------------------- S4
  if (!llave || !PATRON_LLAVE.test(llave)) {
    await registrarEvento('SIN_IDEMPOTENCY_KEY', p.codigo, {});
    throw new Problema(400, 'IDEMPOTENCY_KEY_REQUERIDA', 'Falta la Idempotency-Key',
      'Toda orden de pago debe traer la cabecera Idempotency-Key (8 a 80 caracteres: letras, números, - _ : .). ' +
      'Sin ella, un reintento por red lenta podría cobrar dos veces.');
  }
  if (req.validationError) throw Object.assign(req.validationError, { validation: true });

  const tx = req.body.CdtTrfTxInf;
  const monto = Number(tx.IntrBkSttlmAmt.Amt);
  if (Math.abs(Math.round(monto * 100) - monto * 100) > 1e-6) {
    throw new Problema(400, 'MONTO_INVALIDO', 'Monto con más de 2 decimales', 'Use como máximo dos decimales (centavos).');
  }
  if (tx.DbtrAgt.Id !== p.codigo) {
    throw new Problema(403, 'AGENTE_INCORRECTO', 'DbtrAgt no coincide con su llave',
      `Su llave pertenece a ${p.codigo}, pero el mensaje dice DbtrAgt.Id = ${tx.DbtrAgt.Id}.`);
  }

  const huella = sha256(canonico(req.body));
  const claveCache = `idem:${p.codigo}:${llave}`;

  // 2) ¿Ya vimos esta llave? -> repetimos la MISMA respuesta (no se cobra dos veces)
  const responderRepetido = async (guardado) => {
    if (guardado.huella !== huella) {
      await registrarEvento('LLAVE_REUTILIZADA', p.codigo, { idempotencyKey: llave });
      throw new Problema(422, 'IDEMPOTENCY_KEY_REUTILIZADA', 'Llave usada con otro contenido',
        'Esa Idempotency-Key ya se usó con un pago diferente. Cada pago nuevo necesita una llave nueva.');
    }
    await registrarEvento('REPETICION_DETECTADA', p.codigo, { idempotencyKey: llave, transferenciaId: guardado.respuesta.transferenciaId });
    reply.header('Idempotent-Replayed', 'true');
    return reply.status(200).send({ ...guardado.respuesta, repetida: true, nota: 'Respuesta repetida: este pago ya se había procesado. No se movió dinero otra vez.' });
  };

  const enCache = await cache.get(claveCache);
  if (enCache) return responderRepetido(enCache);

  // 3) Candado: si llegan dos iguales al mismo tiempo (doble clic), solo pasa uno.
  const tengoCandado = await cache.setNX(`lock:${claveCache}`, '1', 30);
  if (!tengoCandado) {
    reply.header('Retry-After', '2');
    throw new Problema(409, 'EN_PROCESO', 'Pago en proceso', 'Ya se está procesando un pago con esta Idempotency-Key. Reintente en 2 segundos.');
  }

  try {
    // 4) Última barrera: la base de datos (por si la caché se perdió).
    const { rows: [previa] } = await pool.query(
      `select * from bce.transferencias where participante_origen=$1 and idempotency_key=$2`, [p.codigo, llave]);
    if (previa) {
      const guardado = { huella: previa.request_hash, respuesta: previa.respuesta };
      await cache.set(claveCache, guardado, TTL_IDEMPOTENCIA);
      return responderRepetido(guardado);
    }

    // 5) Liquidación (todo o nada) ----------------------------------------
    const id = crypto.randomUUID();
    const destino = tx.CdtrAgt.Id;
    const base = {
      id, msg_id: req.body.GrpHdr.MsgId, end_to_end_id: tx.PmtId.EndToEndId,
      participante_origen: p.codigo, participante_destino: destino,
      deudor_nombre: tx.Dbtr.Nm, deudor_cuenta: tx.DbtrAcct.Id,
      acreedor_nombre: tx.Cdtr.Nm, acreedor_cuenta: tx.CdtrAcct.Id,
      monto, moneda: 'USD', concepto: tx.RmtInf?.Ustrd || null,
    };

    const t = await enTransaccion(pool, async (db) => {
      let estado = 'ACSC';
      let motivo = null;
      const { rows: [dest] } = await db.query(`select codigo, activo from bce.participantes where codigo=$1`, [destino]);
      const { rows: [orig] } = await db.query(`select saldo_liquidacion from bce.participantes where codigo=$1 for update`, [p.codigo]);

      if (caos.rechazarPagos) motivo = 'MS03';
      else if (!dest || !dest.activo) motivo = 'RC01';
      else if (destino === p.codigo) motivo = 'AG01';
      else if (Number(orig.saldo_liquidacion) < monto) motivo = 'AM04';
      else if (destino === 'BAS') {
        // El banco destino debe acreditar al cliente final ANTES de confirmar.
        const r = await acreditarEnBancoAndino(id, tx.CdtrAcct.Id, monto, base.concepto, p.codigo, req.id);
        if (!r.ok) motivo = r.codigo;
      }

      if (motivo) estado = 'RJCT';
      else {
        await db.query(`update bce.participantes set saldo_liquidacion = saldo_liquidacion - $2 where codigo=$1`, [p.codigo, monto]);
        await db.query(`update bce.participantes set saldo_liquidacion = saldo_liquidacion + $2 where codigo=$1`, [destino, monto]);
      }
      const ahora = new Date();
      const fila = { ...base, estado, motivo_codigo: motivo, motivo_texto: motivo ? MOTIVOS[motivo] : null, creado: ahora, liquidado: estado === 'ACSC' ? ahora : null };
      const respuesta = respuestaPacs002(fila);
      await db.query(
        `insert into bce.transferencias (id,msg_id,end_to_end_id,participante_origen,participante_destino,deudor_nombre,deudor_cuenta,
           acreedor_nombre,acreedor_cuenta,monto,moneda,concepto,estado,motivo_codigo,motivo_texto,idempotency_key,request_hash,respuesta,creado,liquidado)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [id, fila.msg_id, fila.end_to_end_id, fila.participante_origen, fila.participante_destino, fila.deudor_nombre, fila.deudor_cuenta,
          fila.acreedor_nombre, fila.acreedor_cuenta, monto, 'USD', fila.concepto, estado, motivo, fila.motivo_texto, llave, huella, respuesta, ahora, fila.liquidado]);
      return { fila, respuesta };
    });

    await cache.set(claveCache, { huella, respuesta: t.respuesta }, TTL_IDEMPOTENCIA);
    await registrarEvento(t.fila.estado === 'ACSC' ? 'TRANSFERENCIA_LIQUIDADA' : 'TRANSFERENCIA_RECHAZADA', p.codigo, {
      transferenciaId: id, destino, monto, motivo: t.fila.motivo_codigo,
    });
    if (t.fila.estado === 'ACSC' && destino !== 'BAS') notificarWebhook(destino, t.fila); // sin await: no bloquea
    return reply.status(201).send(t.respuesta);
  } catch (e) {
    if (e.code === '23505') { // otra réplica la insertó primero: repetimos su respuesta
      const { rows: [previa] } = await pool.query(
        `select * from bce.transferencias where participante_origen=$1 and idempotency_key=$2`, [p.codigo, llave]);
      return responderRepetido({ huella: previa.request_hash, respuesta: previa.respuesta });
    }
    throw e;
  } finally {
    await cache.del(`lock:${claveCache}`);
  }
});

app.get('/v1/transferencias', {
  preHandler: autenticar,
  schema: { tags: ['Transferencias'], summary: 'Mis últimas transferencias (enviadas y recibidas)', security: [{ ApiKey: [] }] },
}, async (req) => {
  const { rows } = await pool.query(
    `select respuesta, acreedor_cuenta, concepto from bce.transferencias
      where participante_origen=$1 or participante_destino=$1 order by creado desc limit 50`, [req.participante.codigo]);
  return rows.map((r) => ({ ...r.respuesta, acreedorCuenta: r.acreedor_cuenta, concepto: r.concepto }));
});

app.get('/v1/transferencias/:id', {
  schema: { tags: ['Transferencias'], summary: 'Estado de una transferencia (pacs.002)' },
}, async (req) => {
  const { rows: [t] } = await pool.query(`select respuesta from bce.transferencias where id::text=$1`, [req.params.id]);
  if (!t) throw new Problema(404, 'NO_EXISTE', 'Transferencia no encontrada', 'Revise el identificador.');
  return t.respuesta;
});

app.get('/v1/transferencias/:id/iso20022', {
  schema: {
    tags: ['Transferencias'], summary: 'Ver el mensaje ISO 20022 en XML (pacs.008 o pacs.002)',
    querystring: { type: 'object', properties: { mensaje: { enum: ['pacs008', 'pacs002'], default: 'pacs008' } } },
  },
}, async (req, reply) => {
  const { rows: [t] } = await pool.query(`select * from bce.transferencias where id::text=$1`, [req.params.id]);
  if (!t) throw new Problema(404, 'NO_EXISTE', 'Transferencia no encontrada', 'Revise el identificador.');
  reply.type('application/xml; charset=utf-8');
  return req.query.mensaje === 'pacs002' ? pacs002Xml(t) : pacs008Xml(t);
});

// ---------------------------------------------------------------- participantes
app.get('/v1/participantes/yo', {
  preHandler: autenticar,
  schema: { tags: ['Participantes'], summary: 'Probar mi llave: ¿quién soy para el BCE?', security: [{ ApiKey: [] }] },
}, async (req) => {
  const { rows: [p] } = await pool.query(
    `select codigo, nombre, tipo, webhook_url, saldo_liquidacion, ultima_conexion from bce.participantes where codigo=$1`, [req.participante.codigo]);
  await registrarEvento('CONEXION', p.codigo, {});
  return { ...p, mensaje: `¡Conectado! El BCE lo reconoce como ${p.nombre}.` };
});

app.put('/v1/participantes/yo/webhook', {
  preHandler: autenticar,
  schema: {
    tags: ['Participantes'], summary: 'Registrar la URL donde mi API recibe avisos de dinero entrante',
    security: [{ ApiKey: [] }],
    body: { type: 'object', required: ['url'], additionalProperties: false, properties: { url: { type: 'string', pattern: '^https://', maxLength: 300 } } },
  },
}, async (req) => {
  await pool.query(`update bce.participantes set webhook_url=$2 where codigo=$1`, [req.participante.codigo, req.body.url]);
  await registrarEvento('WEBHOOK_REGISTRADO', req.participante.codigo, { url: req.body.url });
  return { codigo: req.participante.codigo, webhook_url: req.body.url };
});

app.post('/v1/participantes/yo/webhook/prueba', {
  preHandler: autenticar,
  schema: { tags: ['Participantes'], summary: 'El BCE envía un aviso de prueba a mi webhook', security: [{ ApiKey: [] }] },
}, async (req) => {
  const { rows: [p] } = await pool.query(`select webhook_url from bce.participantes where codigo=$1`, [req.participante.codigo]);
  if (!p.webhook_url) throw new Problema(409, 'SIN_WEBHOOK', 'No tiene webhook', 'Registre primero su URL con PUT /v1/participantes/yo/webhook.');
  try {
    const r = await fetch(p.webhook_url, {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { 'content-type': 'application/json', 'x-bce-evento': 'prueba' },
      body: JSON.stringify({ evento: 'prueba', mensaje: 'Hola desde el BCE Faro', fecha: new Date().toISOString() }),
    });
    await registrarEvento(r.ok ? 'WEBHOOK_ENTREGADO' : 'WEBHOOK_FALLIDO', req.participante.codigo, { prueba: true, http: r.status });
    return { entregado: r.ok, http: r.status };
  } catch (e) {
    await registrarEvento('WEBHOOK_FALLIDO', req.participante.codigo, { prueba: true, error: e.message });
    return { entregado: false, error: e.message };
  }
});

// ---------------------------------------------------------------- tablero
app.get('/v1/participantes', {
  schema: { tags: ['Tablero público'], summary: 'Participantes del sistema y su estado de conexión' },
}, async () => {
  const { rows } = await pool.query(`
    select p.codigo, p.nombre, p.tipo, p.saldo_liquidacion, p.ultima_conexion, (p.webhook_url is not null) as tiene_webhook,
           count(t.*) filter (where t.participante_origen=p.codigo and t.estado='ACSC') as enviadas,
           count(t.*) filter (where t.participante_destino=p.codigo and t.estado='ACSC') as recibidas,
           count(t.*) filter (where t.participante_origen=p.codigo and t.estado='RJCT') as rechazadas
      from bce.participantes p left join bce.transferencias t on p.codigo in (t.participante_origen, t.participante_destino)
     group by p.codigo order by p.tipo, p.codigo`);
  return rows.map((r) => ({ ...r, enviadas: Number(r.enviadas), recibidas: Number(r.recibidas), rechazadas: Number(r.rechazadas) }));
});

app.get('/v1/tablero', {
  schema: { tags: ['Tablero público'], summary: 'Eventos recientes y métricas (se proyecta en clase)' },
}, async () => {
  const [{ rows: eventos }, { rows: [m] }, { rows: porEquipo }] = await Promise.all([
    pool.query(`select id, tipo, participante, detalle, creado from bce.eventos order by id desc limit 40`),
    pool.query(`select count(*) filter (where estado='ACSC') as liquidadas,
                       count(*) filter (where estado='RJCT') as rechazadas,
                       coalesce(sum(monto) filter (where estado='ACSC'),0) as monto_liquidado
                  from bce.transferencias`),
    pool.query(`select participante,
                       count(*) filter (where tipo='REPETICION_DETECTADA') as repeticiones_bloqueadas,
                       count(*) filter (where tipo='SIN_IDEMPOTENCY_KEY') as sin_llave,
                       count(*) filter (where tipo='LLAVE_REUTILIZADA') as llave_reutilizada
                  from bce.eventos where participante is not null group by participante`),
  ]);
  return {
    cacheIdempotencia: cache.tipo,
    metricas: { liquidadas: Number(m.liquidadas), rechazadas: Number(m.rechazadas), montoLiquidado: Number(m.monto_liquidado) },
    cumplimiento: porEquipo.map((r) => ({
      participante: r.participante,
      repeticionesBloqueadas: Number(r.repeticiones_bloqueadas),
      sinLlave: Number(r.sin_llave),
      llaveReutilizada: Number(r.llave_reutilizada),
    })),
    eventos,
  };
});

app.get('/listo', { schema: { tags: ['Operación'], summary: 'Readiness: base de datos y caché' } }, async () => {
  await pool.query('select 1');
  return { listo: true, cache: cache.tipo };
});

await arrancar(app);
