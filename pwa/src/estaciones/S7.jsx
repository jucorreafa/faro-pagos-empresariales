import { Box, Skull, ExternalLink } from 'lucide-react';
import { Estacion, Problema, Cargando } from '../componentes/comunes.jsx';
import { api, llaveDocente, archivo, NOMBRES } from '../api.js';
import { useAccion, useSondeo } from '../hooks.js';

function Contenedor({ servicio }) {
  const { datos, error } = useSondeo(servicio, '/salud', 2000);
  const matar = useAccion(async () => (await api(servicio, '/v1/admin/reiniciar', { method: 'POST', docente: true })).datos);
  const vivo = datos && !error;
  return (
    <div className="hoja" style={{ borderColor: vivo ? 'var(--linea)' : 'var(--senal)' }}>
      <div className="fila" style={{ justifyContent: 'space-between' }}>
        <h3 className="fila" style={{ gap: 8 }}><Box size={20} aria-hidden /> {NOMBRES[servicio]}</h3>
        <span className={`etiqueta ${vivo ? 'e-ok' : 'e-mal'}`}>{vivo ? 'Corriendo' : 'Sin respuesta'}</span>
      </div>
      {datos ? (
        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', margin: '10px 0' }} className="chico">
          <dt>Contenedor</dt><dd style={{ margin: 0 }}><code>{datos.contenedor}</code></dd>
          <dt>Plataforma</dt><dd style={{ margin: 0 }}>{datos.plataforma} · {datos.region}</dd>
          <dt>Vivo hace</dt><dd style={{ margin: 0 }}><b>{datos.segundosActivo} s</b></dd>
          <dt>Imagen</dt><dd style={{ margin: 0 }}>node {datos.node} · v{datos.version}</dd>
        </dl>
      ) : <Cargando texto="Buscando el contenedor…" />}
      {llaveDocente() && (
        <button className="boton chico peligro" onClick={matar.ejecutar} disabled={matar.cargando}>
          <Skull size={16} aria-hidden /> Matar el proceso
        </button>
      )}
      {matar.resultado && <p className="chico" style={{ marginTop: 8 }}>Proceso terminado. Mira cómo "Vivo hace" vuelve a cero cuando la plataforma lo levanta.</p>}
      <Problema error={matar.error} />
    </div>
  );
}

export default function S7() {
  return (
    <Estacion
      semana={7}
      titulo="Contenedores y orquestación"
      idea="Cada servicio viaja en su propio contenedor: el mismo paquete corre igual en tu computadora, en Render o en Kubernetes. Si un contenedor muere, la plataforma lo levanta de nuevo, sin que nadie se despierte a las 3 a. m."
      explicacion={<>
        <div>
          <h3>Qué estás viendo</h3>
          <p style={{ margin: 0 }}>Tres contenedores separados, cada uno con su identificador. Cuando el docente "mata" uno, los otros siguen funcionando (aislamiento) y la plataforma lo revive (autocuración). En Render gratuito tarda cerca de un minuto.</p>
        </div>
        <div>
          <h3>Probar Kubernetes sin instalar nada</h3>
          <p>En Killercoda se aplica la carpeta <code>k8s/</code> y se ve cómo Kubernetes mantiene 2 copias de Faro aunque se borre una.</p>
          <a className="boton chico claro" href="https://killercoda.com/playgrounds/scenario/kubernetes" target="_blank" rel="noreferrer"><ExternalLink size={16} aria-hidden /> Abrir Killercoda</a>
        </div>
      </>}
      codigo={[
        ['servicios/bce/Dockerfile', 'La receta del contenedor (usuario sin privilegios)'],
        ['docker-compose.yml', 'Los 3 servicios + base de datos en tu computadora'],
        ['k8s/12-faro-api.yaml', '2 réplicas, límites y sondas de salud'],
        ['k8s/20-red.yaml', 'Solo BCE y Faro pueden hablar con el banco'],
      ]}
      proyecto="¿Qué componentes de tu proyecto irían en contenedores separados? ¿Cuál necesita aislamiento de red como el banco, y qué límites de memoria y CPU le pondrías?"
    >
      <h2>Los tres contenedores, en vivo</h2>
      <div className="rejilla">
        {['faro', 'bce', 'banco'].map((s) => <Contenedor key={s} servicio={s} />)}
      </div>
      <p className="chico" style={{ marginTop: 12, marginBottom: 0 }}>
        Archivos: <a href={archivo('servicios/faro-api/Dockerfile')} target="_blank" rel="noreferrer">Dockerfile</a> · <a href={archivo('k8s/LEEME.md')} target="_blank" rel="noreferrer">guía de Kubernetes</a>
      </p>
    </Estacion>
  );
}
