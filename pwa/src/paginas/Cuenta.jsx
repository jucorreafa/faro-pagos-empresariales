import { useEffect, useRef, useState } from 'react';
import { Building2 } from 'lucide-react';
import { Cargando, Problema } from '../componentes/comunes.jsx';
import { dinero, hora } from '../api.js';
import { useSondeo } from '../hooks.js';

function leer() { try { return localStorage.getItem('faro.cuenta') || ''; } catch { return ''; } }
function guardar(v) { try { localStorage.setItem('faro.cuenta', v); } catch { /* sin almacenamiento */ } }

export default function Cuenta() {
  const [cuenta, setCuenta] = useState(leer);
  const clientes = useSondeo('banco', '/v1/banca/clientes', 60000);
  const detalle = useSondeo('banco', cuenta ? `/v1/banca/cuentas/${cuenta}` : null, 3000, !!cuenta);
  const anterior = useRef(null);
  const [subio, setSubio] = useState(false);

  useEffect(() => {
    const s = detalle.datos?.saldo;
    if (s == null) return undefined;
    if (anterior.current != null && s > anterior.current) setSubio(true);
    anterior.current = s;
    const t = setTimeout(() => setSubio(false), 1700);
    return () => clearTimeout(t);
  }, [detalle.datos?.saldo]);

  const elegir = (v) => { anterior.current = null; setCuenta(v); guardar(v); };
  const personas = (clientes.datos || []).filter((c) => c.tipo_cliente === 'PERSONA');

  return (
    <>
      <h1>Mi cuenta</h1>
      <p className="idea" style={{ marginTop: 8 }}>Cada estudiante es empleado de Andes Café y tiene su cuenta en el Banco Andino. Cuando el docente pague la nómina, tu sueldo aparece aquí.</p>

      <label htmlFor="quien" style={{ display: 'block', fontWeight: 700, margin: '16px 0 6px' }}>¿Quién eres?</label>
      <select id="quien" value={cuenta} onChange={(e) => elegir(e.target.value)} style={{ maxWidth: 420 }}>
        <option value="">Elige tu nombre</option>
        {personas.map((c) => <option key={c.numero} value={c.numero}>{c.nombre}{c.equipo ? ` · ${c.equipo}` : ''}</option>)}
      </select>
      {clientes.error && <Problema error={clientes.error} />}

      {cuenta && (
        <div className="pantalla-banco" style={{ marginTop: 18, maxWidth: 560 }}>
          <header><Building2 size={20} aria-hidden /> Banco Andino · Banca en línea</header>
          <div className="cuerpo">
            {!detalle.datos ? <Cargando texto="Consultando tu cuenta…" /> : (
              <>
                <span className="chico">Cuenta de ahorros {detalle.datos.numero} · {detalle.datos.nombre}</span>
                <div className={`saldo ${subio ? 'subio' : ''}`} aria-live="polite">{dinero(detalle.datos.saldo)}</div>
                <span className="chico">Saldo disponible [SIMULADO]</span>
                <h3 style={{ marginTop: 18 }}>Movimientos</h3>
                <ul className="feed">
                  {detalle.datos.movimientos.map((m, i) => (
                    <li key={i}>
                      <span className="chico">{hora(m.creado)}</span>
                      <span className="fila" style={{ justifyContent: 'space-between' }}>
                        <span>{m.concepto || m.tipo}<span className="chico" style={{ display: 'block' }}>vía {m.origen}</span></span>
                        <b style={{ color: m.tipo === 'CREDITO' ? 'var(--mar)' : 'var(--senal)' }}>{m.tipo === 'CREDITO' ? '+' : '−'}{dinero(m.monto)}</b>
                      </span>
                    </li>
                  ))}
                  {detalle.datos.movimientos.length === 0 && <li><span /> <span className="chico">Aún no tienes movimientos.</span></li>}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
