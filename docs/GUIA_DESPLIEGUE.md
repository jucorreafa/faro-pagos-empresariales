# Guía de despliegue de Faro (docente)

Tiempo estimado: 40 a 60 minutos la primera vez. Todo en planes gratuitos, entrando con **"Continue with GitHub"**.

Orden obligatorio: **1 GitHub → 2 Supabase → 3 Upstash (opcional) → 4 Render → 5 Vercel → 6 Prueba**.
Cada paso usa algo que sale del paso anterior.

Ten a mano el archivo privado **FARO_LLAVES_PRIVADAS.md**. Tiene las llaves. **Nunca lo subas a GitHub ni lo compartas.**

---

## 1. GitHub: el código
1. El repositorio `faro-pagos-empresariales` ya tiene todo el código (lo sube Claude).
2. Comprueba que ves las carpetas `servicios`, `pwa`, `db`, `k8s` y el archivo `render.yaml`.

## 2. Supabase: la base de datos (PostgreSQL)
1. En supabase.com → **New project**. Nombre: `faro`. Región: **East US (North Virginia)**.
2. **Database Password:** pulsa *Generate a password*, cópiala y guárdala. La necesitarás en el punto 6.
3. Espera 1 a 2 minutos a que el proyecto termine de crearse.
4. Menú izquierdo → **SQL Editor** → **New query**.
5. Abre `db/01_esquema.sql` en GitHub, copia todo, pégalo y pulsa **Run**. Debe decir *Success*. Si sale un aviso amarillo de "destructive operation", acéptalo: el script borra y recrea los esquemas de Faro.
6. Repite con `db/02_datos_semilla.sql`.
7. Revisa en **Table Editor**: en el selector de esquema deben aparecer `bce`, `banco` y `faro`.
8. Botón **Connect** (arriba) → pestaña de cadenas de conexión → elige **Session pooler** (no "Direct connection": Render no usa IPv6).
   Copia la cadena. Se parece a esta:
   `postgresql://postgres.abcdxyz:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres`
9. Reemplaza `[YOUR-PASSWORD]` por la contraseña del punto 2. Esa es tu **DATABASE_URL**.

> El plan gratuito pausa el proyecto tras 7 días sin uso. Si pasa, entra a Supabase y pulsa *Restore*.

## 3. Upstash: caché de idempotencia (opcional, recomendado)
1. En upstash.com → **Create Database** → tipo **Redis**. Nombre `faro-idempotencia`. Región: **US-East-1** (N. Virginia). Plan **Free**.
2. En la base creada, busca la sección **REST API**. Copia **UPSTASH_REDIS_REST_URL** y **UPSTASH_REDIS_REST_TOKEN**.
3. Si omites este paso, el BCE usa memoria (plan B) y sigue funcionando. El tablero lo muestra así: "Caché de idempotencia: memoria (plan B)".

## 4. Render: los tres servicios en Docker
1. En render.com → **New** → **Blueprint**.
2. Conecta GitHub si te lo pide y elige `faro-pagos-empresariales`. Render lee `render.yaml` y muestra 3 servicios: `faro-uide-banco`, `faro-uide-bce` y `faro-uide-api`.
3. Te pedirá los valores secretos. Pega exactamente:

| Variable | Valor | Servicios |
|---|---|---|
| DATABASE_URL | la del punto 2.9 | los 3 |
| INTERNAL_KEY | INTERNAL_KEY del archivo privado | los 3 |
| ADMIN_KEY | ADMIN_KEY del archivo privado | los 3 |
| BCE_API_KEY | la llave **FARO** del archivo privado | solo faro-uide-api |
| UPSTASH_REDIS_REST_URL / _TOKEN | punto 3.2 (si no lo hiciste, déjalos vacíos) | solo faro-uide-bce |

4. Pulsa **Deploy Blueprint**. La primera construcción tarda de 3 a 6 minutos por servicio.
5. Cuando los 3 digan **Live**, abre cada URL agregando `/salud`. Ejemplo: `https://faro-uide-bce.onrender.com/salud`. Debe mostrar `"estado":"OK"`.
6. **Importante:** si Render agregó letras al nombre (por ejemplo `faro-uide-banco-x1y2.onrender.com` porque el nombre estaba ocupado), corrige las variables `BANCO_ANDINO_URL` y `BCE_URL` en **Environment** de `faro-uide-bce` y `faro-uide-api`, y pulsa *Save, rebuild and deploy*.

**Plan B si el Blueprint pide tarjeta o falla:** crea cada servicio a mano con **New → Web Service** → el repositorio → *Language*: **Docker** → *Root Directory*: `servicios/bce` (luego `servicios/banco-andino` y `servicios/faro-api`) → *Instance Type*: **Free** → agrega las variables de la tabla. Para `faro-uide-bce` agrega también `BANCO_ANDINO_URL`; para `faro-uide-api`, `BANCO_ANDINO_URL` y `BCE_URL`.

> En el plan gratuito cada servicio se duerme tras 15 minutos sin uso y tarda cerca de 1 minuto en despertar. **Abre la PWA 5 minutos antes de la clase**: al abrirla despierta los tres servicios (las luces arriba se ponen verdes).

## 5. Vercel: la PWA
1. En vercel.com → **Add New… → Project** → importa `faro-pagos-empresariales`.
2. **Root Directory:** pulsa *Edit* y elige **`pwa`**. Framework: Vite (lo detecta solo).
3. Abre **Environment Variables** y agrega:

| Nombre | Valor |
|---|---|
| VITE_FARO_URL | `https://faro-uide-api.onrender.com` |
| VITE_BCE_URL | `https://faro-uide-bce.onrender.com` |
| VITE_BANCO_URL | `https://faro-uide-banco.onrender.com` |
| VITE_REPO_URL | `https://github.com/jucorreafa/faro-pagos-empresariales` |

4. **Deploy.** En 1 minuto tendrás una dirección como `https://faro-pagos-empresariales.vercel.app`.
5. Si luego cambias una variable, ve a **Deployments → ⋯ → Redeploy** (las variables `VITE_` se graban al construir).

## 6. Prueba completa (10 minutos)
1. Abre la PWA. Espera a que las 3 luces estén en verde.
2. **Docente** → pega la `ADMIN_KEY` → *Activar*.
3. **S4** → *Reintento con la misma llave* → debe decir que el dinero se movió una sola vez.
4. **S6** → *Pagar la nómina (9)* → los 9 pagos pasan a *Liquidado*.
5. **Mi cuenta** → elige un empleado → aparece el sueldo.
6. **S6** → *Banco Andino encendido* (se apaga) → *Lanzar 3 pagos urgentes* → quedan *En espera* y el circuito se abre. Enciende el banco → *Reintentar pagos en espera* → *Liquidado*.
7. **Tablero BCE** → ves todo lo anterior en la bitácora.
8. En el celular: abre la dirección de Vercel → menú del navegador → **Agregar a pantalla de inicio**.

## Si algo falla
| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Luz en ámbar más de 2 minutos | Servicio dormido o construyéndose | Revisa en Render que diga *Live*; abre `/salud` |
| Luz en rojo | Servicio caído o apagado desde S6 | Modo docente → S6 → encender; o Render → *Manual Deploy* |
| `/listo` da error 500 | DATABASE_URL incorrecta | Usa **Session pooler** y revisa la contraseña |
| Error 401 al pagar la nómina | ADMIN_KEY distinta entre servicios | Debe ser idéntica en los 3 servicios de Render |
| Pagos en espera con "inalcanzable" | URL de otro servicio mal escrita | Revisa `BANCO_ANDINO_URL` y `BCE_URL` |
| La PWA no ve los servicios | Variables `VITE_` mal escritas | Corrige y haz *Redeploy* en Vercel |

## Reiniciar la demo (dejar saldos como al inicio)
Supabase → SQL Editor → ejecuta otra vez `01_esquema.sql` y `02_datos_semilla.sql`. Luego, en Render, reinicia **los tres** servicios (*Manual Deploy → Restart service*). Si usas Upstash, entra a su *Data Browser* y pulsa **Flush** para borrar las llaves de idempotencia viejas.
