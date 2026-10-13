import { useState } from 'react';
import { KeyRound, ExternalLink } from 'lucide-react';
import { api, llaveDocente, guardarLlaveDocente, URLS, NOMBRES } from '../api.js';
import { Problema, Aviso } from '../componentes/comunes.jsx';
import { useAccion } from '../hooks.js';

export default function Docente() {
  const [llave, setLlave] = useState(llaveDocente());
  const [activa, setActiva] = useState(!!llaveDocente());
  const probar = useAccion(async () => {
    guardarLlaveDocente(llave.trim());
    try {
      const actual = (await api('banco', '/v1/admin/caos')).datos;
      await api('banco', '/v1/admin/caos', { method: 'PUT', body: { disponible: actual.disponible }, docente: true });
    } catch (e) {
      guardarLlaveDocente(''); setActiva(false); throw e;
    }
    setActiva(true); return true;
  });
  const salir = () => { guardarLlaveDocente(''); setLlave(''); setActiva(false); };

  return (
    <>
      <header className="encabezado">
        <h1>Modo docente</h1>
        <p className="lead">Con la llave de administración se activan los controles de fallas (S6), el pago de la nómina y el botón para matar contenedores (S7). La llave queda guardada solo en este dispositivo.</p>
      </header>
      <div className="estacion">
        <div className="tarjeta tarjeta-cuerpo pila">
          {activa ? (
            <>
              <Aviso tono="ok" titulo="Modo docente activo">Este dispositivo puede controlar las demostraciones.</Aviso>
              <div className="fila">
                <a className="boton" href="#/s6">Ir a Resiliencia (S6)</a>
                <button className="boton sec" onClick={salir}>Salir del modo docente</button>
              </div>
            </>
          ) : (
            <>
              <label className="campo">
                Llave de administración
                <input type="password" autoComplete="off" value={llave} onChange={(e) => setLlave(e.target.value)} placeholder="admin_…" />
              </label>
              <div><button className="boton" onClick={probar.ejecutar} disabled={!llave || probar.cargando}><KeyRound size={16} aria-hidden /> Activar</button></div>
              <Problema error={probar.error} />
            </>
          )}
        </div>
        <aside className="tarjeta">
          <div className="tarjeta-cab"><h3>Servicios conectados</h3></div>
          <div className="tarjeta-cuerpo pila" style={{ gap: 10 }}>
            {Object.entries(URLS).map(([k, v]) => (
              <a key={k} className="fila entre" href={`${v}/docs`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                <span>{NOMBRES[k]}</span><ExternalLink size={14} aria-hidden />
              </a>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
