import { Code2, Loader2 } from 'lucide-react';
import { archivo } from '../api.js';

/** El faro: la lámpara muestra el estado de los 3 servicios. */
export function FaroSvg({ estado }) {
  const vals = Object.values(estado);
  const todosOk = vals.every((v) => v === 'ok');
  const algunoMal = vals.some((v) => v === 'caido' || v === 'apagado');
  const lampara = algunoMal ? '#C8102E' : todosOk ? '#EAAA00' : '#F3D27A';
  const barrer = !algunoMal;
  return (
    <svg className="faro-svg" viewBox="0 0 400 330" role="img"
      aria-label={todosOk ? 'Faro encendido: los tres servicios responden' : algunoMal ? 'Faro con falla: un servicio no responde' : 'Faro encendiéndose: despertando servicios'}>
      <defs>
        <linearGradient id="hz" x1="0" x2="1">
          <stop offset="0" stopColor={lampara} stopOpacity=".75" />
          <stop offset="1" stopColor={lampara} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* haz de luz */}
      <g className={`haz ${barrer ? 'barrer' : ''}`}>
        <path d="M200 92 L400 30 L400 154 Z" fill="url(#hz)" />
        <path d="M200 92 L0 30 L0 154 Z" fill="url(#hz)" opacity=".55" />
      </g>
      {/* mar */}
      <path d="M0 290 C 60 278, 110 300, 170 288 S 290 276, 400 290 L400 330 L0 330 Z" fill="#102A43" opacity=".9" />
      <path d="M0 302 C 70 292, 130 312, 200 300 S 320 292, 400 304" stroke="#5B7083" strokeWidth="2" fill="none" />
      {/* roca */}
      <path d="M128 292 C 140 262, 180 256, 200 258 C 228 256, 262 266, 276 292 Z" fill="#33506B" />
      {/* torre */}
      <path d="M176 264 L184 116 L216 116 L224 264 Z" fill="#FBFDFC" stroke="#102A43" strokeWidth="3" />
      <path d="M179 214 L221 214 L223 240 L177 240 Z M182 160 L218 160 L219 184 L181 184 Z" fill="#C8102E" />
      <rect x="182" y="104" width="36" height="12" fill="#102A43" />
      {/* linterna */}
      <rect x="186" y="78" width="28" height="26" rx="3" fill={lampara} stroke="#102A43" strokeWidth="3" />
      <path d="M180 78 L200 58 L220 78 Z" fill="#102A43" />
      <path d="M200 58 L200 48" stroke="#102A43" strokeWidth="3" />
      {/* tres boyas = tres servicios */}
      {['faro', 'bce', 'banco'].map((s, i) => (
        <g key={s} transform={`translate(${70 + i * 130} 284)`}>
          <circle r="7" fill={estado[s] === 'ok' ? '#1F8A70' : estado[s] === 'despertando' ? '#EAAA00' : '#C8102E'} stroke="#FBFDFC" strokeWidth="2" />
        </g>
      ))}
    </svg>
  );
}

export function Cargando({ texto = 'Procesando…' }) {
  return <span className="fila chico"><Loader2 size={16} className="gira" aria-hidden /> {texto}</span>;
}

/** Muestra un error de API en formato RFC 9457 de forma legible. */
export function Problema({ error }) {
  if (!error) return null;
  const c = error.cuerpo || {};
  return (
    <div className="aviso mal" role="alert">
      <strong>{c.title || 'Error'}{error.status ? ` · HTTP ${error.status}` : ''}</strong>
      <div>{c.detail || error.message}</div>
      {c.codigo && <div className="chico">código: <code>{c.codigo}</code>{c.correlationId && <> · correlationId: <code>{c.correlationId.slice(0, 8)}</code></>}</div>}
    </div>
  );
}

export function EtiquetaEstado({ estado }) {
  const clase = {
    LIQUIDADO: 'e-ok', COMPLETADO: 'e-ok', ACSC: 'e-ok', OK: 'e-ok', CERRADO: 'e-ok', AUTORIZADO: 'e-ok',
    EN_ESPERA: 'e-espera', PROCESANDO: 'e-espera', DEBITADO: 'e-luz', PENDIENTE: 'e-luz', SEMIABIERTO: 'e-luz', PARCIAL: 'e-espera',
    COMPENSADO: 'e-luz', FALLIDO: 'e-mal', RJCT: 'e-mal', ABIERTO: 'e-mal', REVOCADO: 'e-mal', RECHAZADO: 'e-mal',
  }[estado] || '';
  const texto = {
    LIQUIDADO: 'Liquidado', COMPLETADO: 'Completado', ACSC: 'ACSC · Liquidada', EN_ESPERA: 'En espera', PROCESANDO: 'Procesando',
    DEBITADO: 'Debitado', PENDIENTE: 'Pendiente', COMPENSADO: 'Compensado', FALLIDO: 'Fallido', RJCT: 'RJCT · Rechazada',
    PARCIAL: 'Parcial', AUTORIZADO: 'Autorizado', REVOCADO: 'Revocado', RECHAZADO: 'Rechazado',
  }[estado] || estado;
  return <span className={`etiqueta ${clase}`}>{texto}</span>;
}

/** Enlaces al código fuente en GitHub. */
export function EnElCodigo({ archivos }) {
  return (
    <div>
      <h3>Míralo en el código</h3>
      <ul className="pila" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {archivos.map(([ruta, nota]) => (
          <li key={ruta}>
            <a href={archivo(ruta)} target="_blank" rel="noreferrer" className="fila" style={{ gap: 6 }}>
              <Code2 size={16} aria-hidden /> <code>{ruta.split('/').slice(-2).join('/')}</code>
            </a>
            <span className="chico">{nota}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Plantilla de cada estación. */
export function Estacion({ semana, titulo, idea, children, explicacion, codigo, proyecto }) {
  return (
    <article>
      <header className="cabecera-estacion">
        <span className="semana">Semana {semana}</span>
        <h1 style={{ fontSize: 'clamp(1.8rem,5vw,2.8rem)' }}>{titulo}</h1>
        <p className="idea">{idea}</p>
      </header>
      <section className="pruebalo" aria-label="Demostración en vivo">
        {children}
      </section>
      <div className="explica">
        {explicacion}
        {codigo && <div><EnElCodigo archivos={codigo} /></div>}
        {proyecto && (
          <div style={{ background: 'var(--luz-suave)' }}>
            <h3>Llévalo a tu proyecto</h3>
            <p style={{ margin: 0 }}>{proyecto}</p>
          </div>
        )}
      </div>
    </article>
  );
}
