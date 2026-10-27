// ---------------------------------------------------------------------------
// Piezas comunes de los tres servicios de Faro.
// Cada servicio tiene SU PROPIA copia de este archivo a propósito: en
// microservicios cada equipo despliega de forma independiente (S6), así que
// no compartimos librerías internas que obliguen a desplegar todo junto.
// ---------------------------------------------------------------------------
import os from 'node:os';
import crypto from 'node:crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import pg from 'pg';

// Postgres devuelve NUMERIC como texto; lo convertimos a número para el JSON.
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

export const INICIO = new Date();

// ---------- Base de datos ----------
export function crearPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta la variable de entorno DATABASE_URL');
  const usarSsl = process.env.DATABASE_SSL !== 'false' && !/localhost|127\.0\.0\.1|@db[:/]/.test(url);
  return new pg.Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX || 3), // plan gratuito: pocas conexiones
    ssl: usarSsl ? { rejectUnauthorized: false } : false,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

/** Ejecuta fn dentro de una transacción (todo o nada). */
export async function enTransaccion(pool, fn) {
  const cli = await pool.connect();
  try {
    await cli.query('begin');
    const r = await fn(cli);
    await cli.query('commit');
    return r;
  } catch (e) {
    await cli.query('rollback').catch(() => {});
    throw e;
  } finally {
    cli.release();
  }
}

// ---------- Errores en formato estándar RFC 9457 (problem+json) — S4 ----------
export class Problema extends Error {
  constructor(status, codigo, titulo, detalle, extra = {}) {
    super(detalle || titulo);
    this.status = status;
    this.codigo = codigo;
    this.titulo = titulo;
    this.detalle = detalle;
    this.extra = extra;
  }
}

export function sha256(texto) {
  return crypto.createHash('sha256').update(texto).digest('hex');
}

/** Comparación en tiempo constante (evita ataques de temporización). */
export function iguales(a = '', b = '') {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Caos controlado (para las demostraciones de clase) ----------
// El docente puede "apagar" el servicio, agregarle lentitud o fallas al azar.
export const caos = { disponible: true, latenciaMs: 0, tasaFalla: 0, rechazarPagos: false };

/** Construye la aplicación Fastify con documentación, CORS y salud. */
export async function crearApp({ nombre, titulo, descripcion, version = '1.0.0', etiquetas = [] }) {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL || 'info' },
    genReqId: (req) => req.headers['x-correlation-id'] || crypto.randomUUID(),
    ajv: { customOptions: { removeAdditional: false, coerceTypes: true, allErrors: true } },
  });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['Idempotent-Replayed', 'X-Correlation-Id', 'X-Servicio'],
  });

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: titulo, description: descripcion, version },
      tags: etiquetas,
      components: {
        securitySchemes: {
          ApiKey: { type: 'apiKey', in: 'header', name: 'X-Api-Key' },
          Interno: { type: 'apiKey', in: 'header', name: 'X-Internal-Key' },
          Admin: { type: 'apiKey', in: 'header', name: 'X-Admin-Key' },
          Bearer: { type: 'http', scheme: 'bearer' },
        },
      },
    },
  });
  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true, tryItOutEnabled: true },
  });

  // Correlación: el mismo id viaja por todos los servicios (observabilidad S9).
  app.addHook('onSend', async (req, reply) => {
    reply.header('X-Correlation-Id', req.id);
    reply.header('X-Servicio', nombre);
  });

  // Caos: se aplica a todo menos salud, documentación y administración.
  app.addHook('onRequest', async (req) => {
    const libre = /^\/(salud|listo|docs|metrics|v1\/metricas|v1\/admin)/.test(req.url) || req.method === 'OPTIONS';
    if (libre) return;
    if (caos.latenciaMs > 0) await dormir(caos.latenciaMs);
    if (!caos.disponible) {
      throw new Problema(503, 'SERVICIO_NO_DISPONIBLE', 'Servicio apagado (simulación)',
        `${titulo} está apagado por el docente para la demostración de resiliencia.`);
    }
    if (caos.tasaFalla > 0 && Math.random() < caos.tasaFalla) {
      throw new Problema(500, 'FALLA_SIMULADA', 'Falla aleatoria (simulación)',
        'Error interno simulado para probar reintentos y Circuit Breaker.');
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof Problema) {
      return reply.status(err.status).type('application/problem+json').send({
        type: `https://faro.uide.demo/errores/${err.codigo.toLowerCase()}`,
        title: err.titulo,
        status: err.status,
        detail: err.detalle,
        instance: req.url,
        codigo: err.codigo,
        correlationId: req.id,
        ...err.extra,
      });
    }
    if (err.validation) {
      return reply.status(400).type('application/problem+json').send({
        type: 'https://faro.uide.demo/errores/validacion',
        title: 'La solicitud no cumple el contrato OpenAPI',
        status: 400,
        detail: err.message,
        instance: req.url,
        codigo: 'VALIDACION',
        correlationId: req.id,
      });
    }
    req.log.error(err);
    return reply.status(500).type('application/problem+json').send({
      type: 'https://faro.uide.demo/errores/interno',
      title: 'Error interno',
      status: 500,
      detail: 'Ocurrió un error inesperado. Revise los registros con el correlationId.',
      instance: req.url,
      codigo: 'INTERNO',
      correlationId: req.id,
    });
  });

  // Salud (liveness) y disponibilidad (readiness) — S7 Kubernetes las usa.
  app.get('/salud', { schema: { tags: ['Operación'], summary: 'Liveness: ¿el proceso está vivo?' } }, async () => ({
    servicio: nombre,
    estado: caos.disponible ? 'OK' : 'APAGADO_SIMULADO',
    version,
    contenedor: os.hostname(), // en Docker/Kubernetes es el id del contenedor/pod
    plataforma: process.env.RENDER ? 'Render' : process.env.KUBERNETES_SERVICE_HOST ? 'Kubernetes' : 'Local/Docker',
    region: process.env.RENDER_REGION || process.env.REGION || 'local',
    iniciado: INICIO.toISOString(),
    segundosActivo: Math.round(process.uptime()),
    caos,
    node: process.version,
  }));

  return app;
}

/** Endpoints de administración del caos (solo con X-Admin-Key). */
export function rutasAdmin(app) {
  const requiereAdmin = async (req) => {
    const llave = process.env.ADMIN_KEY;
    if (!llave || !iguales(req.headers['x-admin-key'], llave)) {
      throw new Problema(401, 'ADMIN_REQUERIDO', 'Solo el docente', 'Se requiere la cabecera X-Admin-Key válida.');
    }
  };
  const esquemaCaos = {
    type: 'object',
    properties: {
      disponible: { type: 'boolean' },
      latenciaMs: { type: 'integer', minimum: 0, maximum: 20000 },
      tasaFalla: { type: 'number', minimum: 0, maximum: 1 },
      rechazarPagos: { type: 'boolean', description: 'Solo BCE: rechaza todo pago (para ver la compensación de la Saga)' },
    },
    additionalProperties: false,
  };
  app.get('/v1/admin/caos', { schema: { tags: ['Operación'], summary: 'Ver la configuración de caos' } }, async () => caos);
  app.put('/v1/admin/caos', {
    preHandler: requiereAdmin,
    schema: { tags: ['Operación'], summary: 'Cambiar el caos (docente)', security: [{ Admin: [] }], body: esquemaCaos },
  }, async (req) => {
    Object.assign(caos, req.body);
    req.log.warn({ caos }, 'Caos actualizado');
    return caos;
  });
  app.post('/v1/admin/reiniciar', {
    preHandler: requiereAdmin,
    schema: { tags: ['Operación'], summary: 'Matar el proceso para ver cómo la plataforma lo revive (S7)', security: [{ Admin: [] }] },
  }, async (req, reply) => {
    reply.send({ mensaje: 'El proceso terminará en 1 segundo. La plataforma (Docker/Kubernetes/Render) debe levantarlo de nuevo.' });
    setTimeout(() => process.exit(1), 1000);
  });
}

export async function arrancar(app) {
  const port = Number(process.env.PORT || 8080);
  await app.listen({ port, host: '0.0.0.0' });
  const cerrar = async () => { await app.close(); process.exit(0); };
  process.on('SIGTERM', cerrar); // Kubernetes/Render envían SIGTERM antes de detener
  process.on('SIGINT', cerrar);
}
