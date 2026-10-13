// ===========================================================================
// FARO · PAGOS EMPRESARIALES — API  ·  Proyecto demostrativo del docente (UIDE)
//
// Arquitectura hexagonal (puertos y adaptadores):
//   dominio/            reglas puras del negocio (centro)
//   aplicacion/         casos de uso + Saga (coordinan)
//   adaptadores/entrada REST/JSON y CSV  -> llaman a los casos de uso
//   adaptadores/salida  Banco Andino, BCE, PostgreSQL -> implementan los puertos
//   resiliencia/        Circuit Breaker y Bulkhead (S6)
//
// Este archivo solo "conecta los cables" (composición). [SIMULADO]
// ===========================================================================
import { crearApp, crearPool, rutasAdmin, arrancar } from './comun/base.js';
import { CircuitBreaker } from './resiliencia/circuitBreaker.js';
import { Bulkhead } from './resiliencia/bulkhead.js';
import { crearAdaptadorBanco } from './adaptadores/salida/bancoAndino.js';
import { crearAdaptadorBce } from './adaptadores/salida/bce.js';
import { crearRepositorio } from './adaptadores/salida/repositorio.js';
import { crearCasosDeUso } from './aplicacion/casosDeUso.js';
import { registrarRutas } from './adaptadores/entrada/rest.js';

const pool = crearPool();

// Un circuito POR dependencia: si cae el banco, el BCE no se ve afectado.
const circuitos = {
  bancoAndino: new CircuitBreaker('Banco Andino', { umbralFallas: 3, tiempoAbiertoMs: 20_000 }),
  bce: new CircuitBreaker('BCE', { umbralFallas: 3, tiempoAbiertoMs: 20_000 }),
};
// Compartimentos separados: lotes grandes vs. pagos urgentes.
const bulkheads = {
  lotes: new Bulkhead('Lotes (nómina y proveedores)', { maxConcurrentes: 2, maxCola: 200 }),
  urgente: new Bulkhead('Pagos urgentes', { maxConcurrentes: 2, maxCola: 20 }),
};

const banco = crearAdaptadorBanco({
  url: process.env.BANCO_ANDINO_URL || 'http://localhost:8102',
  llaveInterna: process.env.INTERNAL_KEY || '',
  circuito: circuitos.bancoAndino,
});
const bce = crearAdaptadorBce({
  url: process.env.BCE_URL || 'http://localhost:8101',
  apiKey: process.env.BCE_API_KEY || '',
  circuito: circuitos.bce,
});
const repo = crearRepositorio(pool);

const app = await crearApp({
  nombre: 'faro-api',
  titulo: 'Faro · Pagos Empresariales',
  descripcion:
    'API del producto demo **Faro**: una empresa paga nómina y proveedores; cada pago pasa por el ' +
    'Banco Andino (débito) y el BCE (liquidación). Muestra arquitectura hexagonal, CQRS, Saga, ' +
    'Circuit Breaker, Bulkhead, idempotencia e ISO 20022. **Dinero ficticio.**',
  etiquetas: [
    { name: 'Comandos (escritura)', description: 'CQRS: lo que CAMBIA el estado' },
    { name: 'Consultas', description: 'CQRS: lo que solo LEE' },
    { name: 'Resiliencia', description: 'S6: Circuit Breaker y Bulkhead' },
    { name: 'Open Banking', description: 'S3: consentimiento y token' },
    { name: 'Demostraciones', description: 'Estaciones de la PWA' },
    { name: 'Operación', description: 'Salud, caos y reinicio' },
  ],
});
rutasAdmin(app);

const casos = crearCasosDeUso({ repo, banco, bce, pool, bulkheads, log: app.log });
registrarRutas(app, { casos, banco, bce, repo, circuitos, bulkheads });

app.get('/listo', { schema: { tags: ['Operación'], summary: 'Readiness: base de datos' } }, async () => {
  await pool.query('select 1');
  return { listo: true };
});

await casos.iniciar();

// Reintento automático cada 15 s de los pagos EN_ESPERA (si los circuitos lo permiten).
setInterval(() => {
  const abiertos = Object.values(circuitos).some((c) => c.estado === 'ABIERTO' && Date.now() < c.abiertoHasta);
  if (!abiertos) casos.reintentarPendientes('auto-reintento').catch((e) => app.log.warn(e.message));
}, 15_000).unref();

await arrancar(app);
