// ===========================================================================
// ADAPTADORES DE ENTRADA (S2 hexagonal): REST/JSON y archivo CSV.
// Dos "puertas" distintas que llaman al MISMO caso de uso crearLote().
// ===========================================================================
import crypto from 'node:crypto';
import { Problema, iguales } from '../../comun/base.js';
import { ErrorDeDominio } from '../../dominio/reglas.js';
import { llamar, ErrorHttp } from '../salida/http.js';

export function registrarRutas(app, { casos, banco, bce, repo, circuitos, bulkheads }) {
  const esDocente = (req) => !!process.env.ADMIN_KEY && iguales(req.headers['x-admin-key'], process.env.ADMIN_KEY);
  const requiereDocente = async (req) => {
    if (!esDocente(req)) throw new Problema(401, 'ADMIN_REQUERIDO', 'Solo el docente', 'Se requiere X-Admin-Key.');
  };
  const traducir = (e) => {
    if (e instanceof ErrorDeDominio) return new Problema(422, e.codigo, 'Regla de negocio', e.message);
    return e;
  };

  // ------------------------------------------------------------------ catálogo
  app.get('/v1/empresa', {
    schema: { tags: ['Consultas'], summary: 'Empresa cliente y sus beneficiarios (empleados y proveedores)' },
  }, async () => {
    const { empresa, beneficiarios } = await casos.cargarCatalogo();
    return { empresa, beneficiarios };
  });

  // ------------------------------------------------------------------ COMANDOS
  const PagoSchema = {
    type: 'object', required: ['beneficiarioId', 'monto'], additionalProperties: false,
    properties: { beneficiarioId: { type: 'string', examples: ['EMP-GARCIA'] }, monto: { type: 'number', examples: [5] } },
  };

  // Adaptador 1: REST / JSON
  app.post('/v1/lotes', {
    schema: {
      tags: ['Comandos (escritura)'],
      summary: 'Crear un lote de pagos (JSON) — Adaptador REST',
      description: 'Estudiantes: solo tipo URGENTE, hasta 3 pagos de máx. 20 USD. El docente (X-Admin-Key) puede crear NOMINA y PROVEEDORES.',
      headers: { type: 'object', properties: { 'idempotency-key': { type: 'string' } } },
      body: {
        type: 'object', required: ['tipo', 'pagos'], additionalProperties: false,
        properties: {
          tipo: { enum: ['NOMINA', 'PROVEEDORES', 'URGENTE'] },
          descripcion: { type: 'string', maxLength: 140 },
          pagos: { type: 'array', minItems: 1, maxItems: 50, items: PagoSchema },
        },
      },
    },
  }, async (req, reply) => {
    try {
      const r = await casos.crearLote({
        ...req.body, canal: req.headers['x-canal'] === 'PWA' ? 'PWA' : 'API',
        idempotencyKey: req.headers['idempotency-key'], esDocente: esDocente(req), correlationId: req.id,
      });
      if (r.repetido) reply.header('Idempotent-Replayed', 'true');
      return reply.status(r.repetido ? 200 : 202).send({ ...r, consultar: `/v1/lotes/${r.loteId}` });
    } catch (e) { throw traducir(e); }
  });

  // Adaptador 2: archivo CSV (como los que envían las empresas a su banco)
  app.addContentTypeParser(['text/csv', 'text/plain'], { parseAs: 'string' }, (req, body, done) => done(null, body));
  app.post('/v1/lotes/csv', {
    schema: {
      tags: ['Comandos (escritura)'],
      summary: 'Crear un lote subiendo un CSV — Adaptador de archivos',
      description: 'Cuerpo text/csv. Primera línea: `beneficiario,monto`. Query: ?tipo=URGENTE',
      querystring: { type: 'object', properties: { tipo: { enum: ['NOMINA', 'PROVEEDORES', 'URGENTE'], default: 'URGENTE' } } },
    },
  }, async (req, reply) => {
    const texto = String(req.body || '').trim();
    const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!/^beneficiario\s*[,;]\s*monto$/i.test(lineas[0] || '')) {
      throw new Problema(400, 'CSV_INVALIDO', 'Encabezado incorrecto', 'La primera línea debe ser: beneficiario,monto');
    }
    const pagos = lineas.slice(1).map((l, i) => {
      const [beneficiarioId, monto] = l.split(/[,;]/).map((x) => x.trim());
      const n = Number(String(monto).replace(',', '.'));
      if (!beneficiarioId || Number.isNaN(n)) throw new Problema(400, 'CSV_INVALIDO', 'Línea inválida', `Revise la línea ${i + 2}: "${l}"`);
      return { beneficiarioId, monto: n };
    });
    try {
      const r = await casos.crearLote({
        tipo: req.query.tipo, pagos, canal: 'CSV', descripcion: 'Archivo CSV',
        idempotencyKey: req.headers['idempotency-key'] || `csv-${crypto.createHash('sha256').update(texto).digest('hex').slice(0, 32)}`,
        esDocente: esDocente(req), correlationId: req.id,
      });
      if (r.repetido) reply.header('Idempotent-Replayed', 'true');
      return reply.status(r.repetido ? 200 : 202).send({ ...r, consultar: `/v1/lotes/${r.loteId}` });
    } catch (e) { throw traducir(e); }
  });

  app.post('/v1/lotes/nomina', {
    preHandler: requiereDocente,
    schema: { tags: ['Comandos (escritura)'], summary: 'Atajo del docente: pagar la nómina completa', security: [{ Admin: [] }] },
  }, async (req, reply) => {
    const empleados = [...casos.catalogo.values()].filter((b) => b.tipo === 'EMPLEADO');
    const r = await casos.crearLote({
      tipo: 'NOMINA', canal: 'PWA', descripcion: `Nómina ${new Date().toLocaleDateString('es-EC', { month: 'long', year: 'numeric', timeZone: 'America/Guayaquil' })}`,
      pagos: empleados.map((b) => ({ beneficiarioId: b.id, monto: Number(b.sueldo) })),
      idempotencyKey: req.headers['idempotency-key'], esDocente: true, correlationId: req.id,
    }).catch((e) => { throw traducir(e); });
    return reply.status(202).send({ ...r, consultar: `/v1/lotes/${r.loteId}` });
  });

  app.post('/v1/pagos/:id/reintentar', {
    schema: { tags: ['Comandos (escritura)'], summary: 'Reintentar un pago EN_ESPERA (misma Idempotency-Key)' },
  }, async (req) => casos.reintentarPago(req.params.id, req.id).catch((e) => { throw traducir(e); }));

  app.post('/v1/pagos/reintentar-pendientes', {
    schema: { tags: ['Comandos (escritura)'], summary: 'Reintentar todos los pagos EN_ESPERA' },
  }, async (req) => casos.reintentarPendientes(req.id));

  // ------------------------------------------------------------------ CONSULTAS
  app.get('/v1/lotes/:id', {
    schema: { tags: ['Consultas'], summary: 'Detalle de un lote con la bitácora de la Saga' },
  }, async (req) => {
    const d = await casos.detalleLote(req.params.id).catch(() => null);
    if (!d) throw new Problema(404, 'LOTE_NO_EXISTE', 'Lote no encontrado', 'Revise el identificador.');
    return d;
  });

  app.get('/v1/reportes/lotes', {
    schema: { tags: ['Consultas'], summary: 'Reporte de lotes (modelo de LECTURA de CQRS)' },
  }, async () => casos.reporte());

  // ------------------------------------------------------------------ resiliencia
  app.get('/v1/resiliencia', {
    schema: { tags: ['Resiliencia'], summary: 'Estado de los Circuit Breakers y de los Bulkheads' },
  }, async () => ({
    circuitos: Object.values(circuitos).map((c) => c.foto()),
    bulkheads: Object.values(bulkheads).map((b) => b.foto()),
  }));

  app.post('/v1/admin/circuitos/reiniciar', {
    preHandler: requiereDocente,
    schema: { tags: ['Resiliencia'], summary: 'Cerrar a mano los circuitos (docente)', security: [{ Admin: [] }] },
  }, async () => {
    Object.values(circuitos).forEach((c) => c.reiniciar());
    return { ok: true };
  });

  // ------------------------------------------------------------------ OPEN BANKING (S3)
  app.post('/v1/open-banking/consentimientos', {
    schema: { tags: ['Open Banking'], summary: '1. Faro pide al banco permiso para ver el saldo de la empresa' },
  }, async () => {
    const r = await banco.pedirConsentimiento(casos.empresa.cuenta);
    await repo.guardarConsentimiento({ id: r.cuerpo.id, cuenta: casos.empresa.cuenta, estado: 'PENDIENTE' });
    return { ...r.cuerpo, bancoUrl: banco.url, siguientePaso: 'El cliente aprueba en la pantalla del Banco Andino.' };
  });

  app.post('/v1/open-banking/consentimientos/:id/token', {
    schema: {
      tags: ['Open Banking'], summary: '2b. El banco devuelve el token a Faro (simulado)',
      body: { type: 'object', required: ['tokenAcceso'], properties: { tokenAcceso: { type: 'string' } } },
    },
  }, async (req) => {
    await repo.guardarConsentimiento({ id: req.params.id, cuenta: casos.empresa.cuenta, estado: 'AUTORIZADO', token: req.body.tokenAcceso });
    return { id: req.params.id, estado: 'AUTORIZADO' };
  });

  app.get('/v1/open-banking/saldo', {
    schema: { tags: ['Open Banking'], summary: '3. Faro consulta el saldo usando el consentimiento' },
  }, async () => {
    const c = await repo.consentimientoVigente();
    if (!c) throw new Problema(403, 'SIN_CONSENTIMIENTO', 'Sin consentimiento', 'La empresa todavía no autoriza a Faro a ver su saldo.');
    try {
      const r = await banco.saldoConToken(c.cuenta, c.token);
      return { ...r.cuerpo, consentimiento: c.id };
    } catch (e) {
      if (e instanceof ErrorHttp && (e.status === 401 || e.status === 403)) {
        await repo.marcarConsentimiento(c.id, 'REVOCADO');
        throw new Problema(403, e.cuerpo?.codigo || 'CONSENTIMIENTO_NO_VIGENTE', 'El banco negó el acceso', e.cuerpo?.detail || e.message);
      }
      throw e;
    }
  });

  // ------------------------------------------------------------------ DEMO IDEMPOTENCIA (S4)
  app.post('/v1/demo/idempotencia', {
    schema: {
      tags: ['Demostraciones'], summary: 'Enviar el mismo pago dos veces al BCE y ver qué pasa',
      body: {
        type: 'object', required: ['escenario'], additionalProperties: false,
        properties: { escenario: { enum: ['MISMA_LLAVE', 'SIN_LLAVE', 'LLAVE_REUTILIZADA', 'LLAVES_DISTINTAS'] } },
      },
    },
  }, async (req) => {
    const cuentaDemo = '2200009999';
    const saldo = async () => (await llamar('Banco Andino', `${banco.url}/v1/banca/cuentas/${cuentaDemo}`)).cuerpo.saldo;
    const id = crypto.randomUUID();
    const mensaje = (monto) => bce.pacs008({
      pagoId: id, monto, deudorNombre: 'Faro · demostración', deudorCuenta: 'FARO-DEMO',
      destino: 'BAS', acreedorNombre: 'Cuenta demo de clase', acreedorCuenta: cuentaDemo, concepto: 'Demo idempotencia S4',
    });
    const m1 = mensaje(1);
    const plan = {
      MISMA_LLAVE: [[m1, `demo-${id}`], [m1, `demo-${id}`]],
      SIN_LLAVE: [[m1, null]],
      LLAVE_REUTILIZADA: [[m1, `demo-${id}`], [mensaje(2), `demo-${id}`]],
      LLAVES_DISTINTAS: [[m1, `demo-${id}-a`], [m1, `demo-${id}-b`]],
    }[req.body.escenario];

    const antes = await saldo();
    const intentos = [];
    for (const [msg, llave] of plan) {
      try {
        const r = await bce.enviarCrudo(msg, llave, req.id);
        intentos.push({ idempotencyKey: llave, monto: msg.CdtTrfTxInf.IntrBkSttlmAmt.Amt, http: r.status, repetida: r.repetida, respuesta: r.cuerpo });
      } catch (e) {
        intentos.push({ idempotencyKey: llave, monto: msg.CdtTrfTxInf.IntrBkSttlmAmt.Amt, http: e.status || 0, error: e.cuerpo || { detail: e.message } });
      }
    }
    const despues = await saldo();
    return { escenario: req.body.escenario, cuenta: cuentaDemo, saldoAntes: antes, saldoDespues: despues, diferencia: Math.round((despues - antes) * 100) / 100, intentos };
  });

  // ------------------------------------------------------------------ mapa del sistema
  app.get('/v1/sistema', {
    schema: { tags: ['Consultas'], summary: 'Mapa del sistema y salud de las dependencias' },
  }, async () => {
    const salud = async (fn) => { try { return (await fn()).cuerpo; } catch (e) { return { estado: 'NO_RESPONDE', error: e.message }; } };
    const [sBanco, sBce] = await Promise.all([salud(banco.salud), salud(bce.salud)]);
    return { dependencias: { bancoAndino: { url: banco.url, ...sBanco }, bce: { url: bce.url, ...sBce } } };
  });
}
