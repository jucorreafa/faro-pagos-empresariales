// ADAPTADOR DE SALIDA → Banco Andino Simulado (puerto "Banco").
// Si mañana la empresa cambia de banco, solo se reemplaza este archivo.
import { llamar } from './http.js';

export function crearAdaptadorBanco({ url, llaveInterna, circuito }) {
  const base = url.replace(/\/$/, '');
  const h = { 'x-internal-key': llaveInterna };
  const via = (fn) => circuito.ejecutar(fn);

  return {
    url: base,
    debitar: ({ cuenta, monto, referencia, concepto }, correlationId) => via(() =>
      llamar('Banco Andino', `${base}/v1/movimientos/debitos`, {
        method: 'POST', headers: h, timeoutMs: 4000, correlationId,
        body: { cuenta, monto, referencia, concepto, origen: 'FARO' },
      })),
    acreditar: ({ cuenta, monto, referencia, concepto }, correlationId) => via(() =>
      llamar('Banco Andino', `${base}/v1/movimientos/creditos`, {
        method: 'POST', headers: h, timeoutMs: 4000, correlationId,
        body: { cuenta, monto, referencia, concepto, origen: 'FARO' },
      })),
    // Open Banking (S3)
    pedirConsentimiento: (cuenta) => via(() =>
      llamar('Banco Andino', `${base}/open-banking/v1/consentimientos`, {
        method: 'POST', headers: h, body: { cuenta, tercero: 'FARO', permisos: ['SALDO'], diasVigencia: 90 },
      })),
    saldoConToken: (cuenta, token) => via(() =>
      llamar('Banco Andino', `${base}/open-banking/v1/cuentas/${cuenta}/saldo`, {
        headers: { authorization: `Bearer ${token}` },
      })),
    salud: () => llamar('Banco Andino', `${base}/salud`, { timeoutMs: 3000 }),
  };
}
