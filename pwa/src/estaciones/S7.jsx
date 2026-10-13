import { Box, Skull, ExternalLink } from 'lucide-react';
import { Estacion, Paso, Problema, Cargando, Aviso } from '../componentes/comunes.jsx';
import { api, llaveDocente, NOMBRES } from '../api.js';
import { useAccion, useSondeo } from '../hooks.js';

function Contenedor({ servicio }) {
  const { datos, error } = useSondeo(servicio, '/salud', 2000);
  const matar = useAccion(async () => (await api(servicio, '/v1/admin/reiniciar', { method: 'POST', docente: true })).datos);
  const vivo = datos && !error;
  const filas = datos ? [
    ['Contenedor', <code key="c">{datos.contenedor.slice(-14)}</code>],
    ['Plataforma', datos.plataforma],
    ['Vivo hace', <b key="v">{datos.segundosActivo} s</b>],
    ['Imagen', `node ${datos.node}`],
  ] : [];
  return (
    <div className="tarjeta" style={{ borderColor: vivo ? 'var(--borde)' : '#f2c4ca' }}>
      <div className="tarjeta-cab">
        <h4 className="fila" style={{ gap: 8 }}><Box size={18} aria-hidden /> {NOMBRES[servicio]}</h4>
        <span className={`etiqueta ${vivo ? 'e-ok' : 'e-mal'}`}>{vivo ? 'Corriendo' : 'Sin respuesta'}</span>
      </div>
      <div className="tarjeta-cuerpo pila" style={{ gap: 8 }}>
        {datos ? filas.map(([k, v]) => <div key={k} className="fila entre"><span className="chico">{k}</span><span>{v}</span></div>) : <Cargando texto="Buscando…" />}
        {llaveDocente() && <button className="boton peligro bloque" style={{ marginTop: 6 }} onClick={matar.ejecutar} disabled={matar.cargando}><Skull size={16} aria-hidden /> Matar el proceso</button>}
        {matar.resultado && <p className="chico">Proceso terminado. "Vivo hace" volverá a cero cuando la plataforma lo levante.</p>}
        <Problema error={matar.error} />
      </div>
    </div>
  );
}

export default function S7() {
  return (
    <Estacion
      semana={7}
      titulo="Contenedores y orquestación"
      idea="Cada servicio viaja en su propio contenedor: el mismo paquete corre igual en tu computadora, en Render o en Kubernetes. Si un contenedor muere, la plataforma lo levanta sola."
      conceptos={[
        ['Contenedor', 'Paquete con el código y todo lo que necesita para correr. Aísla un servicio de los demás.'],
        ['Orquestación', 'Kubernetes mantiene el estado deseado: cuántas copias, cuánta memoria, quién puede hablar con quién. Si algo muere, lo repone.'],
        ['Aislamiento', 'Una regla de red deja que solo el BCE y Faro hablen con el banco (lección del caso Monzo).'],
      ]}
      codigo={[
        ['servicios/bce/Dockerfile', 'Receta del contenedor, usuario sin privilegios'],
        ['docker-compose.yml', 'Los 3 servicios + base de datos en tu PC'],
        ['k8s/12-faro-api.yaml', '2 réplicas, límites y sondas de salud'],
        ['k8s/20-red.yaml', 'NetworkPolicy del banco'],
      ]}
      proyecto="¿Qué componentes de tu proyecto irían en contenedores separados? ¿Cuál necesita aislamiento de red y qué límites de memoria le pondrías?"
    >
      <Paso n={1} titulo="Tres contenedores, en vivo" ayuda="Cada tarjeta consulta /salud de su servicio cada 2 segundos.">
        <div className="rejilla r-3">{['faro', 'bce', 'banco'].map((s) => <Contenedor key={s} servicio={s} />)}</div>
      </Paso>
      <Paso n={2} titulo="Provoca la autocuración" ayuda={llaveDocente() ? 'Pulsa "Matar el proceso" en uno: los otros dos siguen funcionando.' : 'El docente mata un proceso desde su dispositivo.'}>
        <Aviso>En Render gratuito el servicio vuelve en cerca de un minuto. Mientras tanto, los otros dos contenedores siguen respondiendo: eso es aislamiento.</Aviso>
      </Paso>
      <Paso n={3} titulo="Pruébalo en Kubernetes" ayuda="Sin instalar nada, desde el navegador.">
        <a className="boton sec" href="https://killercoda.com/playgrounds/scenario/kubernetes" target="_blank" rel="noreferrer"><ExternalLink size={16} aria-hidden /> Abrir Killercoda</a>
      </Paso>
    </Estacion>
  );
}
