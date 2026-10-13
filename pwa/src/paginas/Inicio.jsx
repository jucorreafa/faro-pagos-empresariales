import { FaroSvg } from '../componentes/comunes.jsx';

export const ESTACIONES = [
  { s: 1, ruta: 's1', titulo: 'Arquitectura de referencia', texto: 'El mapa del sistema y los dominios BIAN' },
  { s: 2, ruta: 's2', titulo: 'Hexagonal y CQRS', texto: 'Dos puertas, un caso de uso; leer separado de escribir' },
  { s: 3, ruta: 's3', titulo: 'Open Banking', texto: 'Consentimiento, token y revocación' },
  { s: 4, ruta: 's4', titulo: 'Contratos, idempotencia e ISO 20022', texto: 'El mismo pago dos veces, cobrado una sola' },
  { s: 5, examen: true, titulo: 'Primer parcial', texto: 'Evaluación' },
  { s: 6, ruta: 's6', titulo: 'Saga, Circuit Breaker y Bulkhead', texto: 'Apaga el banco y mira qué pasa' },
  { s: 7, ruta: 's7', titulo: 'Contenedores y orquestación', texto: 'Mata un contenedor y mira cómo revive' },
];
const PROXIMAS = ['CI/CD y despliegue continuo', 'Observabilidad', 'Seguridad y modelado de amenazas', 'Identidad: OAuth 2.0 y JWT', 'Cifrado y TLS', 'KYC y prevención de lavado', 'Auditoría y regulación'];

export default function Inicio({ estado }) {
  const vals = Object.values(estado);
  const listo = vals.every((v) => v === 'ok');
  const despertando = vals.some((v) => v === 'despertando');
  return (
    <>
      <section className="portada">
        <div>
          <h1>Faro ilumina cómo se mueve el dinero.</h1>
          <p className="lema" style={{ marginTop: 14 }}>
            Andes Café paga la nómina con <b>Faro</b>. El <b>Banco Andino</b> debita, el <b>BCE</b> liquida y el sueldo llega a la cuenta del empleado. Cada semana del curso es una estación donde puedes provocar el concepto y verlo pasar.
          </p>
          <p className={`aviso ${listo ? 'ok' : despertando ? '' : 'mal'}`} role="status">
            {listo && 'Los tres servicios están respondiendo.'}
            {!listo && despertando && 'Despertando los servicios. En el plan gratuito duermen tras 15 minutos sin uso y tardan cerca de un minuto en volver.'}
            {!listo && !despertando && 'Un servicio no responde. Puede estar apagado a propósito para la demostración de resiliencia.'}
          </p>
          <div className="fila">
            <a className="boton luz" href="#/s4">Probar la idempotencia</a>
            <a className="boton claro" href="#/cuenta">Ver mi sueldo</a>
          </div>
        </div>
        <FaroSvg estado={estado} />
      </section>

      <section className="seccion">
        <h2>Ruta de estaciones</h2>
        <ol className="ruta">
          {ESTACIONES.map((e) => (
            <li key={e.s} className={e.examen ? 'examen' : ''}>
              <span className="hito" aria-hidden>S{e.s}</span>
              {e.examen ? (
                <div className="parada" style={{ padding: '12px 16px' }}><b style={{ fontFamily: 'var(--f-titulo)' }}>{e.titulo}</b><span className="chico">Semana {e.s}</span></div>
              ) : (
                <a className="parada" href={`#/${e.ruta}`}>
                  <b>{e.titulo}</b>
                  <span className="chico">Semana {e.s} · {e.texto}</span>
                </a>
              )}
            </li>
          ))}
          {PROXIMAS.map((t) => (
            <li key={t} className="cerrada">
              <span className="hito" aria-hidden>·</span>
              <div className="parada" style={{ padding: '12px 16px', border: '1px dashed var(--linea)', borderRadius: 12 }}>
                <b style={{ fontFamily: 'var(--f-titulo)' }}>{t}</b>
                <span className="chico">Se enciende cuando la veamos en clase</span>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
