-- =====================================================================
-- FARO · Pagos Empresariales  —  Esquema de base de datos (PostgreSQL)
-- Proyecto demostrativo del docente · UIDE · Arquitectura para Plataformas Fintech
--
-- Un solo proyecto Supabase, TRES esquemas separados:
--   bce    -> Banco Central del Ecuador SIMULADO (liquidación entre participantes)
--   banco  -> Banco Andino Simulado (cuentas y movimientos de clientes)
--   faro   -> Faro Pagos Empresariales (lotes de nómina y proveedores)
--
-- Lección de arquitectura (S6 microservicios): cada servicio es dueño de SU
-- esquema y nunca lee las tablas de otro servicio. Si necesita un dato, lo
-- pide por API. [SIMULADO] Todo el dinero de este sistema es ficticio.
--
-- Cómo usar: Supabase -> SQL Editor -> pegar este archivo completo -> Run.
-- Es seguro ejecutarlo varias veces (borra y recrea los tres esquemas).
-- =====================================================================

drop schema if exists faro  cascade;
drop schema if exists bce   cascade;
drop schema if exists banco cascade;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1) BANCO ANDINO SIMULADO
-- ---------------------------------------------------------------------
create schema banco;

create table banco.clientes (
  id          text primary key,
  nombre      text not null,
  tipo        text not null check (tipo in ('EMPRESA','PERSONA','INSTITUCION')),
  equipo      text,                                   -- equipo del curso (solo para la demo)
  creado      timestamptz not null default now()
);

create table banco.cuentas (
  numero      text primary key,
  cliente_id  text not null references banco.clientes(id),
  tipo        text not null default 'CORRIENTE' check (tipo in ('CORRIENTE','AHORROS')),
  moneda      text not null default 'USD',
  saldo       numeric(14,2) not null default 0 check (saldo >= 0),   -- nunca negativo
  creado      timestamptz not null default now()
);

-- Cada movimiento lleva una "referencia" que lo hace idempotente:
-- el mismo débito con la misma referencia NO se aplica dos veces.
create table banco.movimientos (
  id               bigserial primary key,
  cuenta           text not null references banco.cuentas(numero),
  tipo             text not null check (tipo in ('DEBITO','CREDITO')),
  monto            numeric(14,2) not null check (monto > 0),
  saldo_resultante numeric(14,2) not null,
  referencia       text not null,
  concepto         text,
  origen           text,                               -- quién lo pidió (FARO, BCE, ...)
  creado           timestamptz not null default now(),
  unique (cuenta, tipo, referencia)
);
create index on banco.movimientos (cuenta, creado desc);

-- Open Banking (S3): un tercero (Faro) solo puede ver el saldo si el cliente
-- autorizó un consentimiento con permisos, cuenta y fecha de expiración.
create table banco.consentimientos (
  id          uuid primary key default gen_random_uuid(),
  tercero     text not null,
  cuenta      text not null references banco.cuentas(numero),
  permisos    text[] not null,
  estado      text not null default 'PENDIENTE' check (estado in ('PENDIENTE','AUTORIZADO','REVOCADO','RECHAZADO')),
  token_hash  text,
  expira      timestamptz not null,
  creado      timestamptz not null default now(),
  autorizado  timestamptz
);

-- ---------------------------------------------------------------------
-- 2) BCE SIMULADO (Sistema de Pagos Interbancarios)
-- ---------------------------------------------------------------------
create schema bce;

create table bce.participantes (
  codigo              text primary key,                -- BAS, FARO, BILLETERA, ...
  nombre              text not null,
  tipo                text not null check (tipo in ('BANCO','ENTIDAD_PAGO','EQUIPO_CURSO')),
  api_key_hash        text not null,                   -- sha256 de la llave; la llave real nunca se guarda
  webhook_url         text,                            -- dónde avisar cuando reciben dinero
  saldo_liquidacion   numeric(16,2) not null default 0 check (saldo_liquidacion >= 0),
  activo              boolean not null default true,
  ultima_conexion     timestamptz,
  creado              timestamptz not null default now()
);

create table bce.transferencias (
  id                  uuid primary key default gen_random_uuid(),
  msg_id              text not null,
  end_to_end_id       text not null,
  participante_origen text not null references bce.participantes(codigo),
  participante_destino text not null references bce.participantes(codigo),
  deudor_nombre       text not null,
  deudor_cuenta       text not null,
  acreedor_nombre     text not null,
  acreedor_cuenta     text not null,
  monto               numeric(14,2) not null check (monto > 0),
  moneda              text not null default 'USD',
  concepto            text,
  estado              text not null check (estado in ('ACSC','RJCT','PDNG')),
  motivo_codigo       text,                            -- códigos estilo ISO 20022 (AM04, AC03, ...)
  motivo_texto        text,
  idempotency_key     text not null,
  request_hash        text not null,
  respuesta           jsonb not null,
  creado              timestamptz not null default now(),
  liquidado           timestamptz,
  unique (participante_origen, idempotency_key)      -- la base de datos es la última barrera
);
create index on bce.transferencias (creado desc);

-- Bitácora pública para el tablero en vivo
create table bce.eventos (
  id           bigserial primary key,
  tipo         text not null,
  participante text,
  detalle      jsonb not null default '{}'::jsonb,
  creado       timestamptz not null default now()
);
create index on bce.eventos (creado desc);

-- ---------------------------------------------------------------------
-- 3) FARO · PAGOS EMPRESARIALES
-- ---------------------------------------------------------------------
create schema faro;

create table faro.empresas (
  id             text primary key,
  nombre         text not null,
  ruc            text not null,
  banco          text not null,       -- participante BCE de su banco
  cuenta         text not null        -- cuenta de la empresa en ese banco
);

create table faro.beneficiarios (
  id          text primary key,
  empresa_id  text not null references faro.empresas(id),
  nombre      text not null,
  tipo        text not null check (tipo in ('EMPLEADO','PROVEEDOR')),
  banco       text not null,          -- participante BCE destino
  cuenta      text not null,
  equipo      text,
  sueldo      numeric(14,2)
);

-- LADO DE ESCRITURA (Comandos)  ---- CQRS S2
create table faro.lotes (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       text not null references faro.empresas(id),
  tipo             text not null check (tipo in ('NOMINA','PROVEEDORES','URGENTE')),
  canal            text not null default 'API',      -- API, CSV, PWA  (hexagonal: adaptador de entrada)
  descripcion      text,
  estado           text not null default 'CREADO'
                   check (estado in ('CREADO','PROCESANDO','COMPLETADO','PARCIAL','FALLIDO')),
  idempotency_key  text unique,
  creado           timestamptz not null default now(),
  terminado        timestamptz
);

create table faro.pagos (
  id                  uuid primary key default gen_random_uuid(),
  lote_id             uuid not null references faro.lotes(id),
  beneficiario_id     text not null references faro.beneficiarios(id),
  monto               numeric(14,2) not null check (monto > 0),
  estado              text not null default 'PENDIENTE'
                      check (estado in ('PENDIENTE','DEBITADO','LIQUIDADO','EN_ESPERA','COMPENSADO','FALLIDO')),
  debitado            boolean not null default false,   -- ¿ya salió el dinero de la empresa?
  bce_estado          text,                             -- ACSC / RJCT según el BCE
  bce_transferencia   uuid,
  intentos            int not null default 0,
  ultimo_error        text,
  actualizado         timestamptz not null default now()
);
create index on faro.pagos (lote_id);
create index on faro.pagos (estado);

-- Bitácora de la Saga (S6): cada paso y cada compensación queda registrado
create table faro.saga_pasos (
  id        bigserial primary key,
  pago_id   uuid not null references faro.pagos(id),
  paso      text not null,
  resultado text not null check (resultado in ('OK','ERROR','COMPENSACION','ESPERA')),
  detalle   text,
  creado    timestamptz not null default now()
);
create index on faro.saga_pasos (pago_id, id);

-- LADO DE LECTURA (Consultas) ---- CQRS S2
-- Proyección desnormalizada, lista para reportes. La actualiza el "proyector"
-- cada vez que cambia un pago (consistencia eventual).
create table faro.vista_reporte_lotes (
  lote_id          uuid primary key,
  empresa          text not null,
  tipo             text not null,
  canal            text not null,
  estado           text not null,
  pagos_total      int not null,
  pagos_liquidados int not null,
  pagos_en_espera  int not null,
  pagos_compensados int not null,
  monto_total      numeric(14,2) not null,
  monto_liquidado  numeric(14,2) not null,
  creado           timestamptz not null,
  actualizado      timestamptz not null default now()
);

create table faro.consentimientos (
  id            uuid primary key,          -- mismo id que en el banco
  cuenta        text not null,
  estado        text not null,
  token         text,                      -- token de acceso entregado por el banco
  creado        timestamptz not null default now()
);
