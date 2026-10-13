import { useEffect, useRef, useState } from 'react';
import { Building2, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
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
      <header className="encabezado">
        <h1>Mi cuenta</h1>
        <p className="lead">Cada estudiante es empleado de Andes Café y tiene su cuenta en el Banco Andino. Cuando el docente pague la nómina, el sueldo aparece aquí.</p>
      </header>
      <div className="estacion">
        <div className="pantalla-banco">
          <header><Building2 size={18} aria-hidden /> Banco Andino · Banca en línea</header>
          <div className="cuerpo">
            {!cuenta && <p className="chico">Elige tu nombre para ver tu cuenta.</p>}
            {cuenta && !detalle.datos && <Cargando texto="Consultando tu cuenta…" />}
            {detalle.datos && (
              <>
                <div>
                  <span className="chico">Cuenta de ahorros {detalle.datos.numero} · {detalle.datos.nombre}</span>
                  <div className={`saldo ${subio ? 'subio' : ''}`} aria-live="polite" style={{ marginTop: 6 }}>{dinero(detalle.datos.saldo)}</div>
                  <span className="chico">Saldo disponible [SIMULADO]</span>
                </div>
                <div className="separador" />
                <h4>Movimientos</h4>
                <ul className="feed">
                  {detalle.datos.movimientos.map((m, i) => (
                    <li key={i} style={{ gridTemplateColumns: '28px 1fr auto', alignItems: 'center' }}>
                      {m.tipo === 'CREDITO' ? <ArrowDownLeft size={18} color="var(--ok)" aria-hidden /> : <ArrowUpRight size={18} color="var(--mal)" aria-hidden />}
                      <span>{m.concepto || m.tipo}<span className="chico" style={{ display: 'block' }}>{hora(m.creado)} · vía {m.origen}</span></span>
                      <b style={{ color: m.tipo === 'CREDITO' ? 'var(--ok)' : 'var(--mal)' }}>{m.tipo === 'CREDITO' ? '+' : '−'}{dinero(m.monto)}</b>
                    </li>
                  ))}
                  {detalle.datos.movimientos.length === 0 && <li><span /><span className="chico">Aún no tienes movimientos.</span></li>}
                </ul>
              </>
            )}
          </div>
        </div>
        <aside className="tarjeta tarjeta-cuerpo pila" style={{ gap: 12 }}>
          <label className="campo">
            ¿Quién eres?
            <select value={cuenta} onChange={(e) => elegir(e.target.value)}>
              <option value="">Elige tu nombre</option>
              {personas.map((c) => <option key={c.numero} value={c.numero}>{c.nombre}{c.equipo ? ` · ${c.equipo}` : ''}</option>)}
            </select>
          </label>
          <p className="chico">El saldo se actualiza solo cada 3 segundos. Si el docente paga la nómina, verás el crédito con el texto "vía BCE/FARO".</p>
          {clientes.error && <Problema error={clientes.error} />}
        </aside>
      </div>
    </>
  );
}
