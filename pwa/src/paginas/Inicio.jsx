import { Map, Hexagon, ShieldCheck, Repeat, Activity, Boxes, GraduationCap, Lock, ArrowRight } from 'lucide-react';
import { FaroSvg } from '../componentes/comunes.jsx';

export const ESTACIONES = [
  { s: 1, ruta: 's1', icono: Map, titulo: 'Arquitectura de referencia', texto: 'El mapa del sistema: qué pieza hace qué, con nombres BIAN.' },
  { s: 2, ruta: 's2', icono: Hexagon, titulo: 'Hexagonal y CQRS', texto: 'Dos puertas, un mismo caso de uso. Leer separado de escribir.' },
  { s: 3, ruta: 's3', icono: ShieldCheck, titulo: 'Open Banking', texto: 'Consentimiento, token y revocación, paso a paso.' },
  { s: 4, ruta: 's4', icono: Repeat, titulo: 'Idempotencia e ISO 20022', texto: 'El mismo pago enviado dos veces, cobrado una sola.' },
  { s: 5, examen: true, icono: GraduationCap, titulo: 'Primer parcial', texto: 'Semana de evaluación.' },
  { s: 6, ruta: 's6', icono: Activity, titulo: 'Saga, Circuit Breaker y Bulkhead', texto: 'Apaga el banco y mira cómo reacciona el sistema.' },
  { s: 7, ruta: 's7', icono: Boxes, titulo: 'Contenedores y orquestación', texto: 'Mata un contenedor y mira cómo revive.' },
];
export const PROXIMAS = ['CI/CD', 'Observabilidad', 'Modelado de amenazas', 'OAuth 2.0 y JWT', 'Cifrado y TLS', 'KYC y AML', 'Auditoría'];

export function TarjetaEstacion({ e }) {
  const Ico = e.icono;
  if (e.examen) {
    return (
      <div className="tarjeta tarjeta-estacion cerrada">
        <span className="ico"><Ico size={20} aria-hidden /></span>
        <div><span className="chico">Semana {e.s}</span><h3>{e.titulo}</h3></div>
        <p>{e.texto}</p>
      </div>
    );
  }
  return (
    <a className="tarjeta tarjeta-estacion" href={`#/${e.ruta}`}>
      <span className="ico"><Ico size={20} aria-hidden /></span>
      <div><span className="chico">Semana {e.s}</span><h3>{e.titulo}</h3></div>
      <p>{e.texto}</p>
      <div className="pie"><span className="etiqueta e-ok">Disponible</span><ArrowRight size={18} color="var(--marino)" aria-hidden /></div>
    </a>
  );
}

export default function Inicio({ estado }) {
  const vals = Object.values(estado);
  const listo = vals.every((v) => v === 'ok');
  const despertando = vals.some((v) => v === 'despertando');
  return (
    <div className="pila" style={{ gap: 28 }}>
      <section className="tarjeta portada">
        <div className="pila" style={{ gap: 16 }}>
          <div>
            <h1>Faro ilumina cómo se mueve el dinero</h1>
            <p className="lead">Andes Café paga su nómina con <b>Faro</b>. El <b>Banco Andino</b> debita, el <b>BCE</b> liquida y el sueldo llega a la cuenta de cada empleado. Cada semana del curso es una estación donde provocas el concepto y lo ves pasar.</p>
          </div>
          <div className={`aviso ${listo ? 'ok' : despertando ? 'luz' : 'mal'}`} role="status">
            <span className={`punto ${listo ? 'ok' : despertando ? 'despertando' : 'caido'}`} style={{ marginTop: 6 }} aria-hidden />
            <div>
              {listo && <><b>Sistema en línea</b>Los tres servicios están respondiendo.</>}
              {!listo && despertando && <><b>Despertando servicios…</b>En el plan gratuito se duermen tras 15 minutos sin uso y tardan cerca de un minuto en volver.</>}
              {!listo && !despertando && <><b>Un servicio no responde</b>Puede estar apagado a propósito para la demostración de resiliencia.</>}
            </div>
          </div>
          <div className="fila">
            <a className="boton" href="#/s4">Probar la idempotencia</a>
            <a className="boton sec" href="#/cuenta">Ver mi sueldo</a>
          </div>
        </div>
        <FaroSvg estado={estado} />
      </section>

      <section className="pila">
        <div className="fila entre">
          <h2>Estaciones del curso</h2>
          <a href="#/estaciones" className="chico">Ver todas</a>
        </div>
        <div className="rejilla r-3">
          {ESTACIONES.map((e) => <TarjetaEstacion key={e.s} e={e} />)}
          <div className="tarjeta tarjeta-estacion cerrada">
            <span className="ico"><Lock size={18} aria-hidden /></span>
            <div><span className="chico">Semanas 8 a 16</span><h3>Próximas estaciones</h3></div>
            <p>{PROXIMAS.join(' · ')}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
