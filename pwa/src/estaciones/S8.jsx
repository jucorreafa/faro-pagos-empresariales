import { Rocket, ShieldCheck, ShieldAlert, Undo2, Database, KeyRound, PlayCircle, RefreshCw } from 'lucide-react';
import { Estacion, Paso, Aviso, Problema, Cargando } from '../componentes/comunes.jsx';
import { api, llaveDocente } from '../api.js';
import { useAccion, useSondeo } from '../hooks.js';

function PanelVersion({ d }) {
  const sinControles = d.pruebas === 'no ejecutadas';
  const filas = [
    ['Canal', d.canal],
    ['Pruebas', <span key="p" className={`etiqueta ${sinControles ? 'e-mal' : 'e-ok'}`}>{d.pruebas}</span>],
    ['Aprobado por', d.aprobadoPor],
    ['Caché de idempotencia', `${d.cacheTipo} · ${d.cacheLlaves} llave(s)`],
  ];
  return (
    <div className="tarjeta" style={{ borderColor: sinControles ? '#f2c4ca' : 'var(--borde)' }}>
      <div className="tarjeta-cab">
        <h4 className="fila" style={{ gap: 8 }}><Rocket size={18} aria-hidden /> BCE · versión en producción</h4>
        <span className={`etiqueta ${sinControles ? 'e-mal' : 'e-ok'}`}>v{d.version}</span>
      </div>
      <div className="tarjeta-cuerpo pila" style={{ gap: 8 }}>
        {filas.map(([k, v]) => <div key={k} className="fila entre"><span className="chico">{k}</span><span>{v}</span></div>)}
      </div>
    </div>
  );
}

function Escudo({ ok, titulo, texto }) {
  const Ico = ok ? ShieldCheck : ShieldAlert;
  return (
    <div className="tarjeta" style={{ borderColor: ok ? '#bfe3d6' : '#f2c4ca' }}>
      <div className="tarjeta-cab">
        <h4 className="fila" style={{ gap: 8 }}><Ico size={18} aria-hidden /> {titulo}</h4>
        <span className={`etiqueta ${ok ? 'e-ok' : 'e-mal'}`}>{ok ? 'protege' : 'no protege'}</span>
      </div>
      <div className="tarjeta-cuerpo"><p className="chico" style={{ margin: 0 }}>{texto}</p></div>
    </div>
  );
}

export default function S8() {
  const { datos: d } = useSondeo('bce', '/v1/despliegue', 3000);
  const conControles = useAccion(async () => (await api('bce', '/v1/admin/desplegar', { method: 'POST', body: { modo: 'con-controles' }, docente: true })).datos);
  const sinControles = useAccion(async () => (await api('bce', '/v1/admin/desplegar', { method: 'POST', body: { modo: 'sin-controles' }, docente: true })).datos);
  const volver = useAccion(async () => (await api('bce', '/v1/admin/desplegar/volver-atras', { method: 'POST', docente: true })).datos);
  const reinicioReal = useAccion(async () => (await api('bce', '/v1/admin/reiniciar', { method: 'POST', docente: true })).datos);
  const pago = useAccion(async () => (await api('bce', '/v1/admin/demo/pago', { method: 'POST', docente: true })).datos);
  const reintento = useAccion(async () => (await api('bce', '/v1/admin/demo/reintento', { method: 'POST', docente: true })).datos);
  const esDocente = Boolean(llaveDocente());
  const r = reintento.resultado;

  return (
    <Estacion
      semana={8}
      titulo="CI/CD y despliegues"
      idea="Un cambio de código es tan peligroso como una caída de servidor, y lo hace una persona con buenas intenciones. El BCE lo usan los cuatro equipos: publicar una versión mala ahí es publicarla para todos. Veamos la diferencia entre publicar con controles y sin ellos."
      conceptos={[
        ['Entrega continua con aprobación', 'El sistema siempre está listo para publicar, pero una segunda persona aprueba antes de que un cambio llegue a producción. Lo habitual en fintech.'],
        ['Despliegue continuo', 'Todo cambio que pasa las etapas automáticas llega a producción sin que nadie lo apruebe. Rápido, pero nadie mira antes.'],
        ['La última barrera', 'Un despliegue puede perder la caché en memoria. La restricción UNIQUE de la base de datos es la que de verdad impide el doble cobro.'],
      ]}
      codigo={[
        ['servicios/bce/src/servidor.js', 'Endpoints de despliegue (S8) y la prueba de la barrera'],
        ['servicios/bce/src/cache.js', 'Caché en memoria (plan B): se pierde al redesplegar'],
        ['db/01_esquema.sql', 'unique (participante_origen, idempotency_key)'],
        ['.github/workflows/imagenes.yml', 'El pipeline real: construye y publica las imágenes'],
      ]}
      proyecto="ADR-06: ¿entrega continua con aprobación o despliegue continuo para tu fintech? Y si el BCE publica una versión nueva, ¿qué prueba de tu pipeline te avisaría antes que a tus clientes?"
    >
      <Paso n={1} titulo="La versión del BCE, en vivo" ayuda="Esta tarjeta consulta el estado del despliegue del BCE cada 3 segundos.">
        {d ? <PanelVersion d={d} /> : <Cargando texto="Consultando la versión del BCE…" />}
      </Paso>

      <Paso n={2} titulo="Publica un cambio" ayuda={esDocente ? 'Con controles: pruebas + aprobación. Sin controles: ni pruebas ni aprobación, y además se pierde la caché de idempotencia.' : 'El docente publica desde su dispositivo; mira cómo cambia la versión arriba.'}>
        {esDocente ? (
          <>
            <div className="rejilla r-3">
              <button className="boton bloque" onClick={conControles.ejecutar} disabled={conControles.cargando}><ShieldCheck size={16} aria-hidden /> Con controles</button>
              <button className="boton peligro bloque" onClick={sinControles.ejecutar} disabled={sinControles.cargando}><ShieldAlert size={16} aria-hidden /> Sin controles</button>
              <button className="boton sec bloque" onClick={volver.ejecutar} disabled={volver.cargando || !(d && d.puedeVolverAtras)}><Undo2 size={16} aria-hidden /> Volver atrás</button>
            </div>
            {sinControles.resultado && <Aviso tono="mal" titulo="Despliegue sin controles">Se vaciaron {sinControles.resultado.cacheVaciada ?? 0} llave(s) de la caché. Ahora ve al paso 3 y reintenta un pago.</Aviso>}
            {conControles.resultado && <Aviso tono="ok" titulo="Despliegue con controles">Versión nueva con pruebas verdes y aprobación. La caché de idempotencia se conservó.</Aviso>}
            <Problema error={conControles.error || sinControles.error || volver.error} />
            <details style={{ marginTop: 12 }}>
              <summary className="chico">Versión 100% real (reinicia el proceso; tarda ~1 min en Render)</summary>
              <div className="pila" style={{ gap: 8, marginTop: 8 }}>
                <p className="chico" style={{ margin: 0 }}>En vez de simular, reinicia de verdad el BCE. Al volver, su caché en memoria estará vacía igual que con “sin controles”.</p>
                <button className="boton peligro chico" onClick={reinicioReal.ejecutar} disabled={reinicioReal.cargando}><Database size={16} aria-hidden /> Reiniciar el proceso del BCE</button>
                {reinicioReal.resultado && <p className="chico" style={{ margin: 0 }}>El BCE se está reiniciando. Mira en el menú cómo su luz pasa a amarillo y vuelve a verde.</p>}
                <Problema error={reinicioReal.error} />
              </div>
            </details>
          </>
        ) : (
          <Aviso>El docente dirige esta demostración desde su sesión.</Aviso>
        )}
      </Paso>

      <Paso n={3} titulo="La prueba del doble cobro" ayuda="1) Simula un pago (se guarda en la caché). 2) Publica sin controles en el paso 2. 3) Reintenta el mismo pago y mira qué barrera lo frena.">
        {esDocente ? (
          <>
            <div className="fila" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="boton sec" onClick={pago.ejecutar} disabled={pago.cargando}><PlayCircle size={16} aria-hidden /> Simular un pago</button>
              <button className="boton" onClick={reintento.ejecutar} disabled={reintento.cargando}><RefreshCw size={16} aria-hidden /> Reintentar el mismo pago</button>
            </div>
            {pago.resultado && <p className="chico">{pago.resultado.mensaje}</p>}
            {r && (
              <>
                <div className="rejilla r-2" style={{ marginTop: 6 }}>
                  <Escudo ok={r.cacheReconoce} titulo="Caché de idempotencia"
                    texto={r.cacheReconoce ? 'Reconoció el pago y repitió la misma respuesta.' : 'Ya no recuerda el pago: se perdió en el despliegue.'} />
                  <Escudo ok={r.baseRechazoDuplicado} titulo="Base de datos (UNIQUE)"
                    texto={r.baseRechazoDuplicado ? 'Rechazó el segundo registro con la misma llave. El dinero quedó protegido.' : 'No rechazó el duplicado.'} />
                </div>
                <Aviso tono={r.cacheReconoce ? 'ok' : 'mal'} titulo="Resultado">{r.mensaje}</Aviso>
              </>
            )}
            <Problema error={pago.error || reintento.error} />
            <Aviso>La prueba inserta la misma llave dos veces dentro de una transacción que se revierte: no mueve dinero real.</Aviso>
          </>
        ) : (
          <Aviso>El docente ejecuta la prueba; observa los dos escudos (caché y base de datos) en la pantalla principal.</Aviso>
        )}
        {esDocente && d && d.historial?.length > 0 && (
          <div className="tarjeta" style={{ marginTop: 12 }}>
            <div className="tarjeta-cab"><h4>Historial de despliegues (esta sesión)</h4></div>
            <div className="tarjeta-cuerpo">
              <ul className="chico" style={{ margin: 0, paddingLeft: 18 }}>
                {[...d.historial].reverse().map((h, i) => <li key={i}>v{h.version} · {h.modo} · pruebas: {h.pruebas} · aprobó: {h.aprobadoPor}</li>)}
              </ul>
            </div>
          </div>
        )}
      </Paso>
    </Estacion>
  );
}
