// ===========================================================================
// DOMINIO (el centro del hexágono, S2)
// Reglas del negocio puras: no saben nada de HTTP, Postgres, BCE ni Render.
// Por eso se pueden probar solas y no cambian si cambiamos de proveedor.
// ===========================================================================

export const TIPOS_LOTE = ['NOMINA', 'PROVEEDORES', 'URGENTE'];

/** Límites para quien NO es el docente (evita que la demo se use mal). */
export const LIMITES_PUBLICOS = { maxPagos: 3, maxMonto: 20, tipos: ['URGENTE'] };
export const LIMITES_DOCENTE = { maxPagos: 50, maxMonto: 5000, tipos: TIPOS_LOTE };

export class ErrorDeDominio extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.codigo = codigo;
  }
}

/** Máquina de estados del pago: qué cambios están permitidos. */
const TRANSICIONES = {
  PENDIENTE: ['DEBITADO', 'EN_ESPERA', 'FALLIDO'],
  EN_ESPERA: ['DEBITADO', 'EN_ESPERA', 'LIQUIDADO', 'COMPENSADO', 'FALLIDO'],
  DEBITADO: ['LIQUIDADO', 'EN_ESPERA', 'COMPENSADO'],
  LIQUIDADO: [],
  COMPENSADO: [],
  FALLIDO: [],
};

export function puedeCambiar(de, a) {
  return TRANSICIONES[de]?.includes(a) ?? false;
}

export const ESTADOS_FINALES = ['LIQUIDADO', 'COMPENSADO', 'FALLIDO'];

/**
 * Valida un lote antes de aceptarlo.
 * @param {{tipo:string, pagos:{beneficiarioId:string, monto:number}[]}} lote
 * @param {Map<string, object>} beneficiarios  catálogo de la empresa
 * @param {boolean} esDocente
 */
export function validarLote(lote, beneficiarios, esDocente) {
  const lim = esDocente ? LIMITES_DOCENTE : LIMITES_PUBLICOS;
  if (!TIPOS_LOTE.includes(lote.tipo)) throw new ErrorDeDominio('TIPO_INVALIDO', `Tipo de lote desconocido: ${lote.tipo}`);
  if (!lim.tipos.includes(lote.tipo)) {
    throw new ErrorDeDominio('SOLO_DOCENTE', `Solo el docente puede crear lotes de tipo ${lote.tipo}. Los estudiantes pueden probar pagos URGENTE.`);
  }
  if (!lote.pagos?.length) throw new ErrorDeDominio('LOTE_VACIO', 'El lote no tiene pagos.');
  if (lote.pagos.length > lim.maxPagos) throw new ErrorDeDominio('LOTE_GRANDE', `Máximo ${lim.maxPagos} pagos por lote.`);
  const vistos = new Set();
  for (const p of lote.pagos) {
    const b = beneficiarios.get(p.beneficiarioId);
    if (!b) throw new ErrorDeDominio('BENEFICIARIO_DESCONOCIDO', `El beneficiario ${p.beneficiarioId} no está registrado.`);
    if (vistos.has(p.beneficiarioId)) throw new ErrorDeDominio('BENEFICIARIO_DUPLICADO', `${b.nombre} aparece dos veces en el lote.`);
    vistos.add(p.beneficiarioId);
    if (!(p.monto > 0) || p.monto > lim.maxMonto) {
      throw new ErrorDeDominio('MONTO_FUERA_DE_RANGO', `El monto para ${b.nombre} debe estar entre 0,01 y ${lim.maxMonto} USD.`);
    }
    if (Math.abs(Math.round(p.monto * 100) - p.monto * 100) > 1e-6) {
      throw new ErrorDeDominio('MONTO_INVALIDO', 'Los montos usan máximo dos decimales.');
    }
  }
  return true;
}

/** Estado del lote a partir del estado de sus pagos. */
export function estadoDelLote(estadosPagos) {
  const n = estadosPagos.length;
  const cuenta = (e) => estadosPagos.filter((x) => x === e).length;
  const finales = estadosPagos.filter((e) => ESTADOS_FINALES.includes(e)).length;
  if (finales < n) return 'PROCESANDO';
  if (cuenta('LIQUIDADO') === n) return 'COMPLETADO';
  if (cuenta('LIQUIDADO') === 0) return 'FALLIDO';
  return 'PARCIAL';
}
