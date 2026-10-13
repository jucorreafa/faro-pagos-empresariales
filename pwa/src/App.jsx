import { useEffect, useState } from 'react';
import { Lightbulb, Route, Landmark, Wallet, KeyRound } from 'lucide-react';
import { useSaludSistema } from './hooks.js';
import { NOMBRES } from './api.js';
import Inicio, { ESTACIONES } from './paginas/Inicio.jsx';
import Tablero from './paginas/Tablero.jsx';
import Cuenta from './paginas/Cuenta.jsx';
import Docente from './paginas/Docente.jsx';
import S1 from './estaciones/S1.jsx';
import S2 from './estaciones/S2.jsx';
import S3 from './estaciones/S3.jsx';
import S4 from './estaciones/S4.jsx';
import S6 from './estaciones/S6.jsx';
import S7 from './estaciones/S7.jsx';

const PAGINAS = { s1: S1, s2: S2, s3: S3, s4: S4, s6: S6, s7: S7, tablero: Tablero, cuenta: Cuenta, docente: Docente };
const TEXTO_LUZ = { ok: 'responde', despertando: 'despertando', apagado: 'apagado', caido: 'sin respuesta' };

function useRuta() {
  const leer = () => window.location.hash.replace(/^#\/?/, '') || 'inicio';
  const [ruta, setRuta] = useState(leer);
  useEffect(() => {
    const f = () => { setRuta(leer()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return ruta;
}

export default function App() {
  const ruta = useRuta();
  const { estado } = useSaludSistema();
  const Pagina = PAGINAS[ruta];
  const esEstacion = ruta.startsWith('s') && ruta.length === 2;
  const nav = [
    ['inicio', 'Inicio', Lightbulb],
    ['estaciones', 'Estaciones', Route],
    ['tablero', 'Tablero BCE', Landmark],
    ['cuenta', 'Mi cuenta', Wallet],
    ['docente', 'Docente', KeyRound],
  ];
  const actual = (id) => (id === ruta || (id === 'estaciones' && esEstacion) ? 'page' : undefined);

  return (
    <div className="app">
      <header className="barra">
        <a className="marca" href="#/">
          <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden><rect width="32" height="32" rx="7" fill="#102A43" /><path d="M13 27 L14.5 12 h3 L19 27 Z" fill="#FBFDFC" /><rect x="13.5" y="7" width="5" height="5" rx="1" fill="#EAAA00" /><path d="M18.5 9.5 L30 5 V14 Z" fill="#EAAA00" opacity=".55" /></svg>
          <div><b>FARO</b><span>Pagos Empresariales</span></div>
        </a>
        <div className="luces" aria-label="Estado de los servicios">
          {Object.entries(estado).map(([s, e]) => (
            <span key={s} className="piloto" title={`${NOMBRES[s]}: ${TEXTO_LUZ[e]}`}>
              <span className={`punto ${e}`} aria-hidden />
              <span>{s === 'faro' ? 'Faro' : s === 'bce' ? 'BCE' : 'Banco'}</span>
              <span className="sr">{TEXTO_LUZ[e]}</span>
            </span>
          ))}
        </div>
      </header>

      <nav className="nav" aria-label="Secciones">
        {nav.map(([id, texto, Icono]) => (
          <a key={id} href={`#/${id === 'estaciones' ? 'estaciones' : id}`} aria-current={actual(id)}>
            <Icono size={20} aria-hidden /> {texto}
          </a>
        ))}
      </nav>

      <main>
        {ruta === 'estaciones' ? <Estaciones /> : Pagina ? <Pagina /> : <Inicio estado={estado} />}
      </main>
    </div>
  );
}

function Estaciones() {
  return (
    <>
      <h1>Estaciones</h1>
      <p className="idea" style={{ marginTop: 8 }}>Una por semana del curso. Entra a la de hoy.</p>
      <ol className="ruta" style={{ marginTop: 18 }}>
        {ESTACIONES.map((e) => (
          <li key={e.s} className={e.examen ? 'examen' : ''}>
            <span className="hito" aria-hidden>S{e.s}</span>
            {e.examen
              ? <div className="parada" style={{ padding: '12px 16px' }}><b style={{ fontFamily: 'var(--f-titulo)' }}>{e.titulo}</b></div>
              : <a className="parada" href={`#/${e.ruta}`}><b>{e.titulo}</b><span className="chico">{e.texto}</span></a>}
          </li>
        ))}
      </ol>
    </>
  );
}
