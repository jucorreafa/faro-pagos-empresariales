import { Lock } from 'lucide-react';
import { ESTACIONES, PROXIMAS, TarjetaEstacion } from './Inicio.jsx';

export default function Estaciones() {
  return (
    <div className="pila" style={{ gap: 24 }}>
      <header className="encabezado" style={{ marginBottom: 0 }}>
        <h1>Estaciones</h1>
        <p className="lead">Una por semana del curso. Cada estación tiene un laboratorio en vivo, la explicación del concepto y el enlace al código que lo hace funcionar.</p>
      </header>
      <div className="rejilla r-3">
        {ESTACIONES.map((e) => <TarjetaEstacion key={e.s} e={e} />)}
      </div>
      <h2>Próximas estaciones</h2>
      <div className="rejilla r-3">
        {PROXIMAS.map((t) => (
          <div key={t} className="tarjeta tarjeta-estacion cerrada">
            <span className="ico"><Lock size={18} aria-hidden /></span>
            <h3>{t}</h3>
            <p>Se activa cuando la veamos en clase.</p>
          </div>
        ))}
      </div>
    </div>
  );
}
