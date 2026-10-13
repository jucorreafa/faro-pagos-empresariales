import { Code2, Loader2, AlertCircle, CheckCircle2, Lightbulb, BookOpen, Waypoints, Landmark, Building2 } from 'lucide-react';
import { archivo } from '../api.js';

/** El faro de la portada: la lámpara muestra el estado de los 3 servicios. */
export function FaroSvg({ estado }) {
  const vals = Object.values(estado);
  const todosOk = vals.every((v) => v === 'ok');
  const algunoMal = vals.some((v) => v === 'caido' || v === 'apagado');
  const lampara = algunoMal ? '#C42B3C' : todosOk ? '#EAAA00' : '#F3D27A';
  return (
    <svg className="faro-svg" viewBox="0 0 400 300" role="img"
      aria-label={todosOk ? 'Faro encendido: los tres servicios responden' : algunoMal ? 'Faro con falla' : 'Faro encendiéndose'}>
      <defs>
        <linearGradient id="hz" x1="0" x2="1"><stop offset="0" stopColor={lampara} stopOpacity=".7" /><stop offset="1" stopColor={lampara} stopOpacity="0" /></linearGradient>
        <linearGradient id="mar" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#12355B" /><stop offset="1" stopColor="#0E2440" /></linearGradient>
      </defs>
      <g className={`haz ${algunoMal ? '' : 'barrer'}`}>
        <path d="M200 92 L400 36 L400 148 Z" fill="url(#hz)" />
        <path d="M200 92 L0 36 L0 148 Z" fill="url(#hz)" opacity=".5" />
      </g>
      <path d="M0 262 C 80 250, 140 272, 200 262 S 320 250, 400 262 L400 300 L0 300 Z" fill="url(#mar)" />
      <path d="M130 264 C 145 238, 180 232, 200 234 C 226 232, 258 242, 272 264 Z" fill="#44566B" />
      <path d="M178 238 L185 116 L215 116 L222 238 Z" fill="#FFFFFF" stroke="#12355B" strokeWidth="3" />
      <path d="M180 196 L220 196 L221.5 218 L178.5 218 Z M183 150 L217 150 L218 170 L182 170 Z" fill="#C42B3C" />
      <rect x="183" y="104" width="34" height="12" fill="#12355B" />
      <rect x="187" y="80" width="26" height="24" rx="3" fill={lampara} stroke="#12355B" strokeWidth="3" />
      <path d="M181 80 L200 62 L219 80 Z" fill="#12355B" />
    </svg>
  );
}

export function Cargando({ texto = 'Procesando…' }) {
  return <span className="fila chico"><Loader2 size={16} className="gira" aria-hidden /> {texto}</span>;
}

/** Error de API (RFC 9457) legible. */
export function Problema({ error }) {
  if (!error) return null;
  const c = error.cuerpo || {};
  return (
    <div className="aviso mal" role="alert">
      <AlertCircle size={18} color="var(--mal)" aria-hidden />
      <div>
        <b>{c.title || 'Error'}{error.status ? ` · HTTP ${error.status}` : ''}</b>
        <span>{c.detail || error.message}</span>
        {c.codigo && <div className="chico" style={{ marginTop: 4 }}>código <code>{c.codigo}</code>{c.correlationId && <> · correlationId <code>{c.correlationId.slice(0, 8)}</code></>}</div>}
      </div>
    </div>
  );
}

export function Aviso({ tono = '', titulo, children }) {
  const Ico = tono === 'ok' ? CheckCircle2 : tono === 'mal' ? AlertCircle : Lightbulb;
  const color = tono === 'ok' ? 'var(--ok)' : tono === 'mal' ? 'var(--mal)' : '#a07400';
  return (
    <div className={`aviso ${tono}`}>
      <Ico size={18} color={color} aria-hidden />
      <div>{titulo && <b>{titulo}</b>}{children}</div>
    </div>
  );
}

const CLASE = {
  LIQUIDADO: 'e-ok', COMPLETADO: 'e-ok', ACSC: 'e-ok', OK: 'e-ok', CERRADO: 'e-ok', AUTORIZADO: 'e-ok',
  EN_ESPERA: 'e-espera', PROCESANDO: 'e-espera', PARCIAL: 'e-espera', ESPERA: 'e-espera',
  DEBITADO: 'e-luz', PENDIENTE: 'e-luz', SEMIABIERTO: 'e-luz', COMPENSADO: 'e-luz', COMPENSACION: 'e-luz',
  FALLIDO: 'e-mal', RJCT: 'e-mal', ABIERTO: 'e-mal', REVOCADO: 'e-mal', RECHAZADO: 'e-mal', ERROR: 'e-mal',
};
const TEXTO = {
  LIQUIDADO: 'Liquidado', COMPLETADO: 'Completado', ACSC: 'Liquidada', EN_ESPERA: 'En espera', PROCESANDO: 'Procesando',
  DEBITADO: 'Debitado', PENDIENTE: 'Pendiente', COMPENSADO: 'Compensado', FALLIDO: 'Fallido', RJCT: 'Rechazada',
  PARCIAL: 'Parcial', AUTORIZADO: 'Autorizado', REVOCADO: 'Revocado', RECHAZADO: 'Rechazado',
  CERRADO: 'Cerrado', ABIERTO: 'Abierto', SEMIABIERTO: 'Semiabierto',
};
export function EtiquetaEstado({ estado }) {
  return <span className={`etiqueta ${CLASE[estado] || ''}`}>{TEXTO[estado] || estado}</span>;
}

/** Paso numerado del laboratorio. */
export function Paso({ n, titulo, ayuda, activo = true, children }) {
  return (
    <section className={`paso ${activo ? 'activo' : ''}`}>
      <div className="paso-cab">
        <span className="paso-num" aria-hidden>{n}</span>
        <div><h3>{titulo}</h3>{ayuda && <p>{ayuda}</p>}</div>
      </div>
      {children}
    </section>
  );
}

/** Tarjetas seleccionables (comportamiento de radio). */
export function Opciones({ opciones, valor, onCambio, columnas = 2, etiqueta }) {
  return (
    <div className={`opciones ${columnas === 3 ? 'tres' : ''}`} role="radiogroup" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={valor === o.id} className="opcion" onClick={() => onCambio(o.id)}>
          <span className="radio" aria-hidden />
          <span>
            <b>{o.titulo}</b>
            <span className="desc">{o.texto}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Diagrama Faro → BCE → Banco con el estado de cada salto. */
export function FlujoPago({ nodos }) {
  const iconos = { faro: Waypoints, bce: Landmark, banco: Building2 };
  return (
    <div className="flujo" aria-label="Recorrido del pago">
      {nodos.map((n, i) => {
        const Ico = iconos[n.id];
        return [
          i > 0 && <span key={`c${i}`} className={`conector ${n.conector || ''}`} aria-hidden />,
          <div key={n.id} className={`nodo-flujo ${n.estado || ''}`}>
            <span className="ico"><Ico size={18} aria-hidden /></span>
            <b>{n.nombre}</b>
            <small>{n.nota}</small>
          </div>,
        ];
      })}
    </div>
  );
}

/** Plantilla de una estación: encabezado + laboratorio + ficha del concepto. */
export function Estacion({ semana, titulo, idea, children, conceptos = [], codigo = [], proyecto }) {
  return (
    <>
      <header className="encabezado">
        <span className="chip-semana">Semana {semana}</span>
        <h1>{titulo}</h1>
        <p className="lead">{idea}</p>
      </header>
      <div className="estacion">
        <div className="tarjeta laboratorio">{children}</div>
        <aside className="tarjeta ficha" aria-label="Ficha del concepto">
          {conceptos.map(([t, txt]) => (
            <div className="bloque" key={t}>
              <h4><BookOpen size={16} aria-hidden /> {t}</h4>
              <p>{txt}</p>
            </div>
          ))}
          {codigo.length > 0 && (
            <div className="bloque">
              <h4><Code2 size={16} aria-hidden /> En el código</h4>
              <ul className="lista-codigo">
                {codigo.map(([ruta, nota]) => (
                  <li key={ruta}>
                    <a href={archivo(ruta)} target="_blank" rel="noreferrer">{ruta.split('/').slice(-2).join('/')}</a>
                    <span>{nota}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {proyecto && (
            <div className="bloque proyecto">
              <h4><Lightbulb size={16} aria-hidden /> Llévalo a tu proyecto</h4>
              <p>{proyecto}</p>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
