// ===========================================================================
// CASOS DE USO (capa de aplicación del hexágono, S2)
// Aquí se coordina: dominio + puertos. Los adaptadores de entrada (REST, CSV)
// llaman a ESTAS funciones; ninguno tiene lógica de negocio propia.
// ===========================================================================
import { validarLote, estadoDelLote, ErrorDeDominio } from '../dominio/reglas.js';
import { crearSaga } from './saga.js';

export function crearCasosDeUso({ repo, banco, bce, pool, bulkheads, log }) {
  let empresa;
  let catalogo = new Map();
  const enCurso = new Set(); // pagos que se están procesando ahora mismo

  // ------------------------------------------------------------- CQRS: proyector
  // Lado de LECTURA: una tabla desnormalizada lista para reportes.
  // Se actualiza DESPUÉS de cada cambio (consistencia eventual: puede ir
  // unos milisegundos atrás del lado de escritura, y está bien).
  const proyector = {
    actualizar(loteId) {
      setTimeout(async () => {
        try {
          const pagos = await repo.pagosDelLote(loteId);
          if (!pagos.length) return;
          const estado = estadoDelLote(pagos.map((p) => p.estado));
          await repo.actualizarEstadoLote(loteId, estado);
          await pool.query(`
            insert into faro.vista_reporte_lotes (lote_id, empresa, tipo, canal, estado, pagos_total, pagos_liquidados,
                   pagos_en_espera, pagos_compensados, monto_total, monto_liquidado, creado, actualizado)
            select l.id, e.nombre, l.tipo, l.canal, $2, count(p.*),
                   count(*) filter (where p.estado='LIQUIDADO'),
                   count(*) filter (where p.estado='EN_ESPERA'),
                   count(*) filter (where p.estado in ('COMPENSADO','FALLIDO')),
                   coalesce(sum(p.monto),0),
                   coalesce(sum(p.monto) filter (where p.estado='LIQUIDADO'),0),
                   l.creado, now()
              from faro.lotes l join faro.empresas e on e.id=l.empresa_id join faro.pagos p on p.lote_id=l.id
             where l.id=$1 group by l.id, e.nombre
            on conflict (lote_id) do update set estado=excluded.estado, pagos_total=excluded.pagos_total,
              pagos_liquidados=excluded.pagos_liquidados, pagos_en_espera=excluded.pagos_en_espera,
              pagos_compensados=excluded.pagos_compensados, monto_total=excluded.monto_total,
              monto_liquidado=excluded.monto_liquidado, actualizado=now()`, [loteId, estado]);
        } catch (e) {
          log.error(e, 'Proyector CQRS');
        }
      }, 150);
    },
  };

  async function cargarCatalogo() {
    empresa = await repo.empresa();
    const lista = await repo.beneficiarios(empresa.id);
    catalogo = new Map(lista.map((b) => [b.id, b]));
    return { empresa, beneficiarios: lista };
  }

  let saga;
  async function iniciar() {
    await cargarCatalogo();
    saga = crearSaga({ repo, banco, bce, empresa, proyector });
  }

  async function procesarPago(pagoId, tipoLote, correlationId) {
    if (enCurso.has(pagoId)) return null;
    enCurso.add(pagoId);
    const compartimento = tipoLote === 'URGENTE' ? bulkheads.urgente : bulkheads.lotes;
    try {
      return await compartimento.ejecutar(pagoId.slice(0, 8), () => saga.ejecutar(pagoId, correlationId));
    } finally {
      enCurso.delete(pagoId);
    }
  }

  /** CASO DE USO: crear y procesar un lote de pagos (lo usan REST, CSV y la PWA). */
  async function crearLote({ tipo, pagos, canal, descripcion, idempotencyKey, esDocente, correlationId }) {
    // Idempotencia también en Faro: el mismo lote enviado dos veces no se duplica.
    const existente = await repo.loteConLlave(idempotencyKey);
    if (existente) return { loteId: existente.id, repetido: true };

    validarLote({ tipo, pagos }, catalogo, esDocente);
    const lote = await repo.crearLote({ empresaId: empresa.id, tipo, canal, descripcion, idempotencyKey, pagos });
    proyector.actualizar(lote.id);

    // Se procesa en segundo plano: el cliente recibe 202 Accepted de inmediato.
    const lista = await repo.pagosDelLote(lote.id);
    for (const p of lista) {
      procesarPago(p.id, tipo, correlationId).catch((e) => log.warn({ err: e.message }, 'pago rechazado por bulkhead'));
    }
    return { loteId: lote.id, repetido: false, pagos: lista.length };
  }

  /** CASO DE USO: reintentar los pagos que quedaron en espera. */
  async function reintentarPendientes(correlationId) {
    const ids = await repo.pagosEnEspera();
    for (const id of ids) {
      const p = await repo.pago(id);
      procesarPago(id, p.tipo_lote, correlationId).catch(() => {});
    }
    return { reintentando: ids.length };
  }

  async function reintentarPago(pagoId, correlationId) {
    const p = await repo.pago(pagoId);
    if (!p) throw new ErrorDeDominio('PAGO_NO_EXISTE', 'Pago no encontrado');
    if (p.estado !== 'EN_ESPERA') throw new ErrorDeDominio('NO_REINTENTABLE', `El pago está ${p.estado}; solo se reintentan pagos EN_ESPERA.`);
    procesarPago(pagoId, p.tipo_lote, correlationId).catch(() => {});
    return { reintentando: pagoId };
  }

  // ------------------------------------------------------------- Lado de LECTURA
  async function detalleLote(id) {
    const lote = await repo.lote(id);
    if (!lote) return null;
    const [pagos, pasos] = await Promise.all([repo.pagosDelLote(lote.id), repo.pasosDelLote(lote.id)]);
    return {
      ...lote,
      pagos: pagos.map((p) => ({
        id: p.id, beneficiario: p.beneficiario, banco: p.banco, cuenta: p.cuenta, monto: p.monto, estado: p.estado,
        intentos: p.intentos, ultimoError: p.ultimo_error, bceTransferencia: p.bce_transferencia,
        pasos: pasos.filter((s) => s.pago_id === p.id).map((s) => ({ paso: s.paso, resultado: s.resultado, detalle: s.detalle, creado: s.creado })),
      })),
    };
  }

  async function reporte() {
    const { rows } = await pool.query(`select * from faro.vista_reporte_lotes order by creado desc limit 30`);
    const totales = rows.reduce((a, r) => ({
      lotes: a.lotes + 1,
      montoLiquidado: a.montoLiquidado + Number(r.monto_liquidado),
      pagosLiquidados: a.pagosLiquidados + r.pagos_liquidados,
      pagosEnEspera: a.pagosEnEspera + r.pagos_en_espera,
    }), { lotes: 0, montoLiquidado: 0, pagosLiquidados: 0, pagosEnEspera: 0 });
    return { fuente: 'faro.vista_reporte_lotes (modelo de LECTURA, CQRS)', totales, lotes: rows };
  }

  return {
    iniciar, cargarCatalogo, crearLote, reintentarPendientes, reintentarPago, detalleLote, reporte,
    get empresa() { return empresa; },
    get catalogo() { return catalogo; },
  };
}
