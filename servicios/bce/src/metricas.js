// ===========================================================================
// S9 · Observabilidad. [SIMULADO · solo demostración de la semana 9]
// Instrumenta de verdad el BCE: cada petición real (de los 4 equipos, de Faro
// o de la demostración) queda contada. Con eso calcula un SLI, el presupuesto
// de error y el ritmo de consumo EN VIVO, y publica las mismas cifras en dos
// formatos:
//   · GET /metrics        → formato de texto de Prometheus (lo que un
//                           Prometheus real vendría a buscar, modelo «pull»).
//   · GET /v1/metricas    → JSON con el SLI, el presupuesto y las alertas.
//
// Honestidad sobre los límites (se enseña en clase):
//   · Los contadores viven en la MEMORIA del proceso: si Render duerme o
//     reinicia el servicio, empiezan de cero (igual que un counter de
//     Prometheus cuando se reinicia el programa).
//   · No sirve para contabilidad: el monto exacto vive en la base de datos.
//   · Las sondas /salud, /listo, /docs, la administración y las propias
//     rutas de métricas NO cuentan: no son tráfico de clientes.
// ===========================================================================
import crypto from 'node:crypto';

const LIBRES = /^\/(salud|listo|docs|metrics|v1\/metricas|v1\/admin|favicon)/;
const CUBOS = [0.05, 0.1, 0.25, 0.5, 0.8, 1, 2.5, 5]; // segundos; 0,8 s = umbral del SLI de latencia
const UMBRAL_RAPIDO = 0.8;
const RETENCION_MIN = 360; // 6 horas de historia, un registro por minuto

export function instalarMetricas(app, { requiereDocente, caos }) {
  const inicio = Date.now();
  const minutos = new Map(); // minuto (epoch/60000) -> { total, e5, r4, rapidas }
  let porRutaClase = new Map(); // "ruta|clase" -> n  (etiquetas de POCOS valores: S9)
  let cubos = CUBOS.map(() => 0);
  let sumaSeg = 0;
  let cuenta = 0;

  const clase = (s) => `${Math.floor(s / 100)}xx`;

  function registrar(ruta, status, seg) {
    const m = Math.floor(Date.now() / 60000);
    let b = minutos.get(m);
    if (!b) {
      b = { total: 0, e5: 0, r4: 0, rapidas: 0 };
      minutos.set(m, b);
      for (const k of minutos.keys()) if (k < m - RETENCION_MIN) minutos.delete(k);
    }
    b.total += 1;
    if (status >= 500) b.e5 += 1;
    else if (status >= 400) b.r4 += 1;
    if (seg < UMBRAL_RAPIDO) b.rapidas += 1;
    const k = `${ruta}|${clase(status)}`;
    porRutaClase.set(k, (porRutaClase.get(k) || 0) + 1);
    cuenta += 1;
    sumaSeg += seg;
    CUBOS.forEach((le, i) => { if (seg <= le) cubos[i] += 1; });
  }

  function reiniciar() {
    minutos.clear();
    porRutaClase = new Map();
    cubos = CUBOS.map(() => 0);
    sumaSeg = 0;
    cuenta = 0;
  }

  // Cada respuesta del BCE (incluidas las que fallaron en el hook de caos).
  app.addHook('onResponse', async (req, reply) => {
    const url = req.raw.url || '';
    if (LIBRES.test(url) || req.method === 'OPTIONS') return;
    const ruta = req.routeOptions?.url || 'no_encontrada';
    registrar(ruta, reply.statusCode, (reply.elapsedTime || 0) / 1000);
  });

  // ---- ventanas y cálculo del SLI --------------------------------------
  function ventana(n) {
    const ahora = Math.floor(Date.now() / 60000);
    const v = { total: 0, e5: 0, r4: 0, rapidas: 0 };
    for (let m = ahora - n + 1; m <= ahora; m += 1) {
      const b = minutos.get(m);
      if (b) { v.total += b.total; v.e5 += b.e5; v.r4 += b.r4; v.rapidas += b.rapidas; }
    }
    v.validas = v.total - v.r4;
    v.tasaError = v.validas > 0 ? v.e5 / v.validas : null;
    return v;
  }

  function resumen(sloPct) {
    const slo = sloPct / 100;
    const permitido = 1 - slo;
    const ritmo = (v) => (v.tasaError === null ? null : v.tasaError / permitido);
    const w5 = ventana(5); const w30 = ventana(30); const w60 = ventana(60); const w360 = ventana(360);
    const r5 = ritmo(w5); const r30 = ritmo(w30); const r60 = ritmo(w60); const r360 = ritmo(w360);
    const todo = ventana(RETENCION_MIN);
    const sli = todo.validas > 0 ? 1 - todo.e5 / todo.validas : null;
    const sliLat = todo.total > 0 ? todo.rapidas / todo.total : null;
    const pagina = r60 !== null && r5 !== null && r60 >= 14.4 && r5 >= 14.4;
    const ticket = r360 !== null && r30 !== null && r360 >= 3 && r30 >= 3;
    const ingenua = (() => { // la regla «mala»: más de 1 % de error en el último minuto
      const u = ventana(1); return u.tasaError !== null && u.tasaError > 0.01;
    })();
    const horasHasta = (r) => (r && r > 0 ? Math.round((720 / r) * 10) / 10 : null);
    const ahora = Math.floor(Date.now() / 60000);
    const serie = [];
    for (let m = ahora - 29; m <= ahora; m += 1) {
      const b = minutos.get(m) || { total: 0, e5: 0, r4: 0, rapidas: 0 };
      serie.push({ minuto: m * 60000, total: b.total, errores5xx: b.e5, rechazos4xx: b.r4, rapidas: b.rapidas });
    }
    return {
      slo: sloPct,
      errorPermitido: permitido,
      iniciado: new Date(inicio).toISOString(),
      segundosActivo: Math.round((Date.now() - inicio) / 1000),
      historiaMin: RETENCION_MIN,
      peticiones: { total: todo.total, validas: todo.validas, errores5xx: todo.e5, rechazos4xx: todo.r4 },
      sli: { disponibilidad: sli, latencia: sliLat, umbralLatenciaMs: UMBRAL_RAPIDO * 1000, cumple: sli === null ? null : sli >= slo },
      ritmoDeConsumo: { m5: r5, m30: r30, h1: r60, h6: r360 },
      presupuestoDuraHoras: { alRitmoDe1h: horasHasta(r60), alRitmoDe5min: horasHasta(r5) },
      alertas: {
        pagina: { regla: 'ritmo ≥ 14,4 en 1 h y en 5 min', activa: pagina },
        ticket: { regla: 'ritmo ≥ 3 en 6 h y en 30 min', activa: ticket },
        ingenua: { regla: 'más de 1 % de error en el último minuto', activa: ingenua },
      },
      serie,
      caos: { disponible: caos.disponible, latenciaMs: caos.latenciaMs, tasaFalla: caos.tasaFalla },
      nota: 'Contadores en memoria: se reinician si el servicio se duerme o se reinicia. No sirven para contabilidad.',
    };
  }

  // ---- GET /v1/metricas (JSON) ------------------------------------------
  app.get('/v1/metricas', {
    schema: {
      tags: ['Observabilidad (S9)'],
      summary: 'SLI, ritmo de consumo y alertas del BCE, en vivo',
      querystring: { type: 'object', properties: { slo: { type: 'number', minimum: 90, maximum: 99.999, default: 99.5 } } },
    },
  }, async (req) => resumen(req.query.slo ?? 99.5));

  // ---- GET /metrics (formato de texto de Prometheus) --------------------
  app.get('/metrics', {
    schema: { tags: ['Observabilidad (S9)'], summary: 'Métricas en formato Prometheus (lo que Prometheus vendría a buscar)' },
  }, async (req, reply) => {
    const L = [];
    L.push('# HELP faro_bce_http_requests_total Peticiones atendidas, por ruta y clase de respuesta.');
    L.push('# TYPE faro_bce_http_requests_total counter');
    for (const [k, n] of [...porRutaClase.entries()].sort()) {
      const [ruta, cl] = k.split('|');
      L.push(`faro_bce_http_requests_total{ruta="${ruta}",clase="${cl}"} ${n}`);
    }
    L.push('# HELP faro_bce_http_request_duration_seconds Duración de las peticiones.');
    L.push('# TYPE faro_bce_http_request_duration_seconds histogram');
    CUBOS.forEach((le, i) => L.push(`faro_bce_http_request_duration_seconds_bucket{le="${le}"} ${cubos[i]}`));
    L.push(`faro_bce_http_request_duration_seconds_bucket{le="+Inf"} ${cuenta}`);
    L.push(`faro_bce_http_request_duration_seconds_sum ${sumaSeg.toFixed(6)}`);
    L.push(`faro_bce_http_request_duration_seconds_count ${cuenta}`);
    L.push('# HELP faro_bce_uptime_seconds Segundos desde que arrancó el proceso (se reinicia a 0 al reiniciar).');
    L.push('# TYPE faro_bce_uptime_seconds gauge');
    L.push(`faro_bce_uptime_seconds ${Math.round((Date.now() - inicio) / 1000)}`);
    reply.type('text/plain; version=0.0.4; charset=utf-8');
    return `${L.join('\n')}\n`;
  });

  // ---- Administración de la demostración (solo docente) -----------------
  // Genera tráfico REAL contra el propio BCE (pasa por los mismos hooks: si el
  // docente activó caos, las fallas y la lentitud son reales). Una parte del
  // tráfico es un rechazo de negocio (401 sin llave): NO cuenta como fallo.
  app.post('/v1/admin/demo/trafico', {
    schema: {
      tags: ['Observabilidad (S9)'],
      summary: 'Generar tráfico de prueba contra el BCE (docente)',
      security: [{ Admin: [] }],
      body: { type: 'object', additionalProperties: false, properties: { n: { type: 'integer', minimum: 1, maximum: 120, default: 40 } } },
    },
  }, async (req) => {
    requiereDocente(req);
    const n = req.body?.n ?? 40;
    const resultados = { n, ok: 0, rechazosNegocio: 0, fallas: 0 };
    const una = async () => {
      const rechazo = crypto.randomInt(0, 100) < 8;
      const r = await app.inject({ method: 'GET', url: rechazo ? '/v1/transferencias' : '/v1/despliegue' });
      if (r.statusCode >= 500) resultados.fallas += 1;
      else if (r.statusCode >= 400) resultados.rechazosNegocio += 1;
      else resultados.ok += 1;
    };
    const lote = caos.latenciaMs > 0 ? 10 : 20;
    for (let i = 0; i < n; i += lote) {
      await Promise.all(Array.from({ length: Math.min(lote, n - i) }, una));
    }
    return resultados;
  });

  app.post('/v1/admin/demo/metricas/reiniciar', {
    schema: { tags: ['Observabilidad (S9)'], summary: 'Poner los contadores en cero (docente)', security: [{ Admin: [] }] },
  }, async (req) => {
    requiereDocente(req);
    reiniciar();
    return { mensaje: 'Contadores en cero.' };
  });

  return { resumen, registrar, reiniciar };
}
