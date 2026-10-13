# Kubernetes para Faro (S7)

Estos manifiestos describen **el estado deseado**: "quiero 2 copias de faro-api,
1 del BCE y 1 del banco, con límites de memoria, sondas de salud y una regla de red
que protege al banco". Kubernetes se encarga de que eso sea verdad todo el tiempo.

| Archivo | Qué declara |
|---|---|
| 00-namespace.yaml | El espacio `faro` (aislamiento lógico) |
| 01-config.yaml | Configuración y secretos (ejemplo) |
| 10/11/12-*.yaml | Deployment (pods) + Service (DNS interno) de cada servicio |
| 20-red.yaml | NetworkPolicy: solo BCE y Faro pueden llamar al banco |

## Probar sin instalar nada
1. Entrar a https://killercoda.com/playgrounds/scenario/kubernetes (gratis, con cuenta GitHub).
2. `git clone https://github.com/jucorreafa/faro-pagos-empresariales && cd faro-pagos-empresariales/k8s`
3. Reemplazar `jucorreafa` en los archivos 10/11/12 (`sed -i 's/jucorreafa/usuario/' 1*.yaml`).
4. `kubectl apply -f .`
5. `kubectl -n faro get pods -w` → ver cómo nacen los pods.
6. `kubectl -n faro delete pod -l app=faro-api` → ver cómo Kubernetes los **revive solo**.

**Nota sobre réplicas:** el BCE tiene 1 réplica porque, sin Redis, su caché de
idempotencia vive en memoria. Con 2 réplicas, cada una tendría su propia memoria
y solo la restricción UNIQUE de la base de datos evitaría el doble cobro.
Con Upstash Redis configurado se puede escalar a 2 o más.
