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
    // S8 · CI/CD: un redespliegue del BCE (una sola réplica, sin Redis) pierde
    // esta memoria. Lo modelamos borrando las llaves con un prefijo.
    async flushPrefijo(pref) {
      let n = 0;
      for (const k of [...datos.keys()]) if (k.startsWith(pref)) { datos.delete(k); n += 1; }
      return n;
    },
    async contar(pref) {
      let n = 0;
      for (const k of [...datos.keys()]) if (k.startsWith(pref) && vivo(k)) n += 1;
      return n;
    },
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
    async flushPrefijo(pref) {
      try { const ks = await r.keys(`${pref}*`); if (ks?.length) await r.del(...ks); return ks?.length || 0; } catch { return 0; }
    },
    async contar(pref) {
      try { const ks = await r.keys(`${pref}*`); return ks?.length || 0; } catch { return 0; }
    },
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
  // S8 · CI/CD. Vacía la caché de idempotencia (y los candados), como ocurriría
  // en un redespliegue del BCE cuando la caché vive en memoria.
  async flushIdempotencia() {
    let n = 0;
    try { n += await principal.flushPrefijo('idem:'); await principal.flushPrefijo('lock:'); } catch { /* seguimos */ }
    if (principal !== memoria) { await memoria.flushPrefijo('idem:'); await memoria.flushPrefijo('lock:'); }
    return n;
  },
  async contarIdempotencia() { try { return await principal.contar('idem:'); } catch { return 0; } },
};
