// Conexión con los 3 servicios. Las URLs se configuran en Vercel
// (Settings → Environment Variables) o en el archivo .env.local.
const limpia = (u, d) => (u || d).replace(/\/$/, '');

export const URLS = {
  faro: limpia(import.meta.env.VITE_FARO_URL, 'http://localhost:8100'),
  bce: limpia(import.meta.env.VITE_BCE_URL, 'http://localhost:8101'),
  banco: limpia(import.meta.env.VITE_BANCO_URL, 'http://localhost:8102'),
};
export const REPO = import.meta.env.VITE_REPO_URL || 'https://github.com/jucorreafa/faro-pagos-empresariales';
export const archivo = (ruta) => `${REPO}/blob/main/${ruta}`;

export const NOMBRES = { faro: 'Faro API', bce: 'BCE Simulado', banco: 'Banco Andino' };

export function llaveDocente() {
  try { return localStorage.getItem('faro.llaveDocente') || ''; } catch { return ''; }
}
export function guardarLlaveDocente(v) {
  try { v ? localStorage.setItem('faro.llaveDocente', v) : localStorage.removeItem('faro.llaveDocente'); } catch { /* sin almacenamiento */ }
}

export class ErrorApi extends Error {
  constructor(status, cuerpo) {
    super(cuerpo?.detail || cuerpo?.title || `Error ${status}`);
    this.status = status;
    this.cuerpo = cuerpo;
  }
}

/** Llama a un servicio. Devuelve { status, datos, cabeceras }. */
export async function api(servicio, ruta, { method = 'GET', body, headers = {}, docente = false, texto = false, timeoutMs = 75000 } = {}) {
  const h = { ...headers };
  if (body !== undefined && !texto) h['content-type'] = 'application/json';
  if (docente && llaveDocente()) h['x-admin-key'] = llaveDocente();
  let r;
  try {
    r = await fetch(URLS[servicio] + ruta, {
      method,
      headers: h,
      body: body === undefined ? undefined : texto ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new ErrorApi(0, { title: 'Sin conexión', detail: `${NOMBRES[servicio]} no respondió (${e.name === 'TimeoutError' ? 'tiempo agotado' : 'red'}).` });
  }
  const tipo = r.headers.get('content-type') || '';
  const datos = tipo.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new ErrorApi(r.status, typeof datos === 'object' ? datos : { detail: datos });
  return { status: r.status, datos, cabeceras: r.headers };
}

export const dinero = (n) =>
  new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(n || 0));

export const hora = (f) =>
  new Date(f).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: 'America/Guayaquil' });
