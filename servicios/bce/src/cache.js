// ---------------------------------------------------------------------------
// Caché de idempotencia.
//  - Con Upstash Redis (UPSTASH_REDIS_REST_URL y _TOKEN): la caché es compartida
//    y sobrevive a reinicios del servicio. Es lo recomendado.
//  - Sin Redis: se usa memoria del proceso (plan B). Funciona, pero se pierde al
//    reiniciar; por eso la base de datos tiene una restricción UNIQUE como última
//    barrera. Nunca dependemos solo de la caché.
// ---------------------------------------------------------------------------
import { Redis } from '@upstash/redis';

function cacheMemoria() {
  const datos = new Map();
  const vivo = (k) => {
    const e = datos.get(k);
    if (!e) return undefined;
    if (e.expira < Date.now()) { datos.delete(k); return undefined; }
    return e;
  };
  return {
    tipo: 'memoria (plan B)',
    async get(k) { return vivo(k)?.v ?? null; },
    async set(k, v, segundos) { datos.set(k, { v, expira: Date.now() + segundos * 1000 }); },
    async setNX(k, v, segundos) {
      if (vivo(k)) return false;
      datos.set(k, { v, expira: Date.now() + segundos * 1000 });
      return true;
    },
    async del(k) { datos.delete(k); },
  };
}

function cacheUpstash(url, token) {
  const r = new Redis({ url, token });
  return {
    tipo: 'Upstash Redis',
    async get(k) { return r.get(k); },
    async set(k, v, segundos) { await r.set(k, v, { ex: segundos }); },
    async setNX(k, v, segundos) { return (await r.set(k, v, { nx: true, ex: segundos })) === 'OK'; },
    async del(k) { await r.del(k); },
  };
}

const memoria = cacheMemoria();
const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const principal = url && token ? cacheUpstash(url, token) : memoria;

// Si Redis falla, no detenemos los pagos: seguimos con memoria + base de datos.
export const cache = {
  get tipo() { return principal.tipo; },
  async get(k) { try { return await principal.get(k); } catch { return memoria.get(k); } },
  async set(k, v, s) { try { await principal.set(k, v, s); } catch { await memoria.set(k, v, s); } },
  async setNX(k, v, s) { try { return await principal.setNX(k, v, s); } catch { return memoria.setNX(k, v, s); } },
  async del(k) { try { await principal.del(k); } catch { await memoria.del(k); } },
};
