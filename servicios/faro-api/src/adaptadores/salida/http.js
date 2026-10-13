// Cliente HTTP mínimo con tiempo límite. Lanza errores con .status para que el
// Circuit Breaker distinga "el servicio falló" (5xx, red) de "pedimos mal" (4xx).
export class ErrorHttp extends Error {
  constructor(status, cuerpo, servicio) {
    super(cuerpo?.title || cuerpo?.detail || `HTTP ${status} desde ${servicio}`);
    this.status = status;
    this.cuerpo = cuerpo;
    this.servicio = servicio;
  }
}

export async function llamar(servicio, url, { method = 'GET', headers = {}, body, timeoutMs = 5000, correlationId } = {}) {
  let r;
  try {
    r = await fetch(url, {
      method,
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const err = new Error(e.name === 'TimeoutError'
      ? `${servicio} no respondió en ${timeoutMs / 1000} s`
      : `${servicio} inalcanzable (${e.cause?.code || e.message})`);
    err.tiempoAgotado = e.name === 'TimeoutError';
    err.servicio = servicio;
    throw err;
  }
  const texto = await r.text();
  let cuerpo;
  try { cuerpo = texto ? JSON.parse(texto) : null; } catch { cuerpo = { texto }; }
  if (!r.ok) throw new ErrorHttp(r.status, cuerpo, servicio);
  return { status: r.status, cuerpo, repetida: r.headers.get('idempotent-replayed') === 'true' };
}
