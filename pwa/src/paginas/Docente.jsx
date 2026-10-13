import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { api, llaveDocente, guardarLlaveDocente, URLS } from '../api.js';
import { Problema } from '../componentes/comunes.jsx';
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
      <h1>Modo docente</h1>
      <p className="idea" style={{ marginTop: 8 }}>Con la llave de administración se activan los controles de fallas (S6), el pago de la nómina y el botón para matar contenedores (S7). La llave queda guardada solo en este dispositivo.</p>
      <div className="hoja" style={{ maxWidth: 520, marginTop: 16 }}>
        {activa ? (
          <>
            <p className="aviso ok">Modo docente activo en este dispositivo.</p>
            <div className="fila">
              <a className="boton" href="#/s6">Ir a resiliencia</a>
              <button className="boton claro" onClick={salir}>Salir del modo docente</button>
            </div>
          </>
        ) : (
          <>
            <label htmlFor="llave" style={{ fontWeight: 700 }}>Llave de administración</label>
            <input id="llave" type="password" autoComplete="off" value={llave} onChange={(e) => setLlave(e.target.value)} style={{ margin: '6px 0 10px' }} />
            <button className="boton" onClick={probar.ejecutar} disabled={!llave || probar.cargando}><KeyRound size={18} aria-hidden /> Activar</button>
            <Problema error={probar.error} />
          </>
        )}
      </div>
      <div className="hoja" style={{ maxWidth: 520 }}>
        <h3>Servicios conectados</h3>
        <ul className="chico" style={{ paddingLeft: 18, margin: '6px 0 0' }}>
          {Object.entries(URLS).map(([k, v]) => <li key={k}>{k}: <a href={`${v}/docs`} target="_blank" rel="noreferrer">{v}</a></li>)}
        </ul>
      </div>
    </>
  );
}
