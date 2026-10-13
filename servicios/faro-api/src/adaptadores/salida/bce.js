// ADAPTADOR DE SALIDA → BCE Simulado (puerto "Sistema de pagos").
// Traduce un pago de Faro a un mensaje pacs.008 (ISO 20022) y envía la
// Idempotency-Key. Faro es participante del BCE con el código FARO.
import { llamar } from './http.js';

export function crearAdaptadorBce({ url, apiKey, circuito }) {
  const base = url.replace(/\/$/, '');

  function pacs008({ pagoId, monto, deudorNombre, deudorCuenta, destino, acreedorNombre, acreedorCuenta, concepto }) {
    return {
      GrpHdr: { MsgId: `FARO-${pagoId.slice(0, 8)}-${Date.now().toString(36)}`, CreDtTm: new Date().toISOString(), NbOfTxs: 1 },
      CdtTrfTxInf: {
        PmtId: { EndToEndId: `E2E-${pagoId.slice(0, 30)}` },
        IntrBkSttlmAmt: { Ccy: 'USD', Amt: monto },
        DbtrAgt: { Id: 'FARO' }, Dbtr: { Nm: deudorNombre }, DbtrAcct: { Id: deudorCuenta },
        CdtrAgt: { Id: destino }, Cdtr: { Nm: acreedorNombre }, CdtrAcct: { Id: acreedorCuenta },
        RmtInf: { Ustrd: concepto },
      },
    };
  }

  /** Envío crudo (sin circuito) para la estación de idempotencia. */
  const enviarCrudo = (mensaje, idempotencyKey, correlationId) =>
    llamar('BCE', `${base}/v1/transferencias`, {
      method: 'POST', timeoutMs: 10_000, correlationId,
      headers: { 'x-api-key': apiKey, ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}) },
      body: mensaje,
    });

  return {
    url: base,
    pacs008,
    enviarCrudo,
    // El MsgId cambia en cada intento, pero el cuerpo debe ser IDÉNTICO para que el
    // BCE reconozca el reintento. Por eso el MsgId se deriva solo del pago.
    transferir: (datos, correlationId) => {
      const mensaje = pacs008(datos);
      mensaje.GrpHdr.MsgId = `FARO-${datos.pagoId.slice(0, 30)}`;
      mensaje.GrpHdr.CreDtTm = datos.creado;
      return circuito.ejecutar(() => enviarCrudo(mensaje, `faro-${datos.pagoId}`, correlationId));
    },
    salud: () => llamar('BCE', `${base}/salud`, { timeoutMs: 3000 }),
  };
}
