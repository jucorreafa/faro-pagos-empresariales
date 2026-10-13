import { useEffect, useState } from 'react';
import { LayoutDashboard, Route, Landmark, Wallet, KeyRound, ChevronRight, ShieldCheck } from 'lucide-react';
import { useSaludSistema } from './hooks.js';
import { NOMBRES, llaveDocente } from './api.js';
import Inicio, { ESTACIONES } from './paginas/Inicio.jsx';
import Estaciones from './paginas/Estaciones.jsx';
import Tablero from './paginas/Tablero.jsx';
import Cuenta from './paginas/Cuenta.jsx';
import Docente from './paginas/Docente.jsx';
import S1 from './estaciones/S1.jsx';
import S2 from './estaciones/S2.jsx';
import S3 from './estaciones/S3.jsx';
import S4 from './estaciones/S4.jsx';
import S6 from './estaciones/S6.jsx';
import S7 from './estaciones/S7.jsx';

const PAGINAS = { s1: S1, s2: S2, s3: S3, s4: S4, s6: S6, s7: S7, estaciones: Estaciones, tablero: Tablero, cuenta: Cuenta, docente: Docente };
const TITULOS = { inicio: 'Inicio', estaciones: 'Estaciones', tablero: 'Tablero del BCE', cuenta: 'Mi cuenta', docente: 'Modo docente' };
const TEXTO_LUZ = { ok: 'Responde', despertando: 'Despertando…', apagado: 'Apagado', caido: 'Sin respuesta' };
const NAV = [
  ['inicio', 'Inicio', LayoutDashboard],
  ['estaciones', 'Estaciones', Route],
  ['tablero', 'Tablero BCE', Landmark],
  ['cuenta', 'Mi cuenta', Wallet],
  ['docente', 'Docente', KeyRound],
];

function Logo({ tam = 30 }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#12355B" />
      <path d="M13 27 L14.5 12 h3 L19 27 Z" fill="#FFFFFF" />
      <rect x="13.5" y="7" width="5" height="5" rx="1" fill="#EAAA00" />
      <path d="M18.5 9.5 L30 5 V14 Z" fill="#EAAA00" opacity=".55" />
    </svg>
  );
}

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
  const estacion = ESTACIONES.find((e) => e.ruta === ruta);
  const seccion = estacion ? 'estaciones' : ruta;
  const actual = (id) => (id === seccion ? 'page' : undefined);
  const docente = !!llaveDocente();

  return (
    <div className="app">
      <aside className="lateral" aria-label="Menú principal">
        <a className="marca" href="#/">
          <Logo />
          <span><b>FARO</b><span>Pagos Empresariales</span></span>
        </a>
        <nav className="menu">
          {NAV.map(([id, texto, Icono]) => (
            <a key={id} href={`#/${id}`} aria-current={actual(id)}><Icono size={18} aria-hidden /> {texto}</a>
          ))}
        </nav>
        <div className="estado-sistema" aria-label="Estado de los servicios">
          <span className="titulo">Estado del sistema</span>
          {Object.entries(estado).map(([s, e]) => (
            <div key={s} className="servicio-fila">
              <span className={`punto ${e}`} aria-hidden />
              <span className="nombre">{NOMBRES[s]}</span>
              <span className="valor">{TEXTO_LUZ[e]}</span>
            </div>
          ))}
        </div>
      </aside>

      <div className="principal">
        <header className="barra">
          <a className="marca-movil" href="#/"><Logo tam={26} /> FARO</a>
          <nav className="migas" aria-label="Ruta">
            <a href="#/">Faro</a>
            <ChevronRight size={14} aria-hidden />
            {estacion ? (
              <>
                <a href="#/estaciones">Estaciones</a>
                <ChevronRight size={14} aria-hidden />
                <b>S{estacion.s} · {estacion.titulo}</b>
              </>
            ) : <b>{TITULOS[ruta] || 'Inicio'}</b>}
          </nav>
          <div className="fila">
            {docente && <span className="etiqueta e-luz"><ShieldCheck size={14} aria-hidden /> Docente</span>}
            <div className="luces-movil" aria-label="Estado de los servicios">
              {Object.entries(estado).map(([s, e]) => <span key={s} className={`punto ${e}`} title={`${NOMBRES[s]}: ${TEXTO_LUZ[e]}`} />)}
            </div>
          </div>
        </header>

        <main className="contenido">
          {Pagina ? <Pagina /> : <Inicio estado={estado} />}
        </main>
      </div>

      <nav className="nav-movil" aria-label="Secciones">
        {NAV.map(([id, texto, Icono]) => (
          <a key={id} href={`#/${id}`} aria-current={actual(id)}><Icono size={20} aria-hidden /> {texto}</a>
        ))}
      </nav>
    </div>
  );
}
