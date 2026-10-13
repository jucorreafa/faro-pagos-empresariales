# Faro · Pagos Empresariales

Proyecto demostrativo del docente para **Arquitectura para Plataformas Fintech** (UIDE, Finanzas y Negocios Digitales).
Faro "ilumina" a los proyectos de los estudiantes: cada semana del curso es una **estación** donde el concepto se puede provocar y ver en vivo.

> [SIMULADO] Todo el dinero, las empresas y los bancos de este proyecto son ficticios.

## Las piezas

| Pieza | Carpeta | Dónde vive | Rol |
|---|---|---|---|
| **BCE Simulado** | `servicios/bce` | Render (Docker) | Liquida transferencias entre participantes (ISO 20022, idempotencia) |
| **Banco Andino Simulado** | `servicios/banco-andino` | Render (Docker) | Cuentas, débitos/créditos y Open Banking |
| **Faro API** | `servicios/faro-api` | Render (Docker) | Nómina y proveedores: hexagonal, CQRS, Saga, Circuit Breaker, Bulkhead |
| **Faro PWA** | `pwa` | Vercel | La app que se abre en clase y en el celular |
| Base de datos | `db` | Supabase (PostgreSQL) | Un esquema por servicio: `bce`, `banco`, `faro` |
| Caché | — | Upstash Redis (opcional) | Llaves de idempotencia del BCE por 24 h |

```
 Empresa ──▶ Faro API ──(1) débito──▶ Banco Andino
                 │
                 └──(2) pacs.008 + Idempotency-Key──▶ BCE ──(3) crédito──▶ Banco Andino ──▶ Empleado
 Equipos del curso (BILLETERA, NEXOCREDIT, REMESAS, AGROANTICIPO) ──▶ BCE  (con su X-Api-Key)
```

## Estaciones (semana → concepto)
S1 Arquitectura de referencia/BIAN · S2 Hexagonal y CQRS · S3 Open Banking · S4 OpenAPI, idempotencia, errores RFC 9457 e ISO 20022 · S6 Saga, Circuit Breaker, Bulkhead · S7 Docker y Kubernetes.

## Contratos (OpenAPI)
Cada servicio publica su contrato en `/docs` (Swagger UI) y `/docs/json`.

## Correr en tu computadora
```bash
cp .env.ejemplo .env      # completar llaves
docker compose up --build
cd pwa && npm install && npm run dev
```

## Despliegue
Ver `docs/GUIA_DESPLIEGUE.md`.
