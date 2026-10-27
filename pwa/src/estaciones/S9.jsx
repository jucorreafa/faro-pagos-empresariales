import { useState } from 'react';
import { Gauge, BellRing, Bell, BellOff, Flame, Zap, TimerReset, FileText, RefreshCw } from 'lucide-react';
import { Estacion, Paso, Aviso, Problema, Cargando } from '../componentes/comunes.jsx';
import { api, llaveDocente } from '../api.js';
import { useAccion, useSondeo } from '../hooks.js';

const pct = (n, d = 2) => (n === null || n === undefined ? '—' : `${(n * 100).toLocaleString('es-EC', { minimumFractionDigits: d, maximumFractionDigits: d })} %`);
const num = (n, d = 1) => (n === null || n === undefined ? '—' : n.toLocaleString('es-EC', { minimumFractionDigits: d, maximumFractionDigits: d }));

/** Barras: % de error de cada uno de los últimos 30 minutos. */
function Barras({ serie, permitido }) {
  const datos = serie.map((s) => {
    const validas = s.total - s.rechazos4xx;
    return { ...s, tasa: validas > 0 ? s.errores5xx / validas : 0, validas };
  });
  const max = Math.max(permitido * 2, ...datos.map((d) => d.tasa), 0.02);
  const W = 600; const H = 110; const ancho = W / datos.length;
  const yPermitido = H - (permitido / max) * H;
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label="Porcentaje de error por minuto, últimos 30 minutos" style={{ width: '100%', height: 'auto' }}>
      {datos.map((d, i) => {
        const h = Math.max(d.tasa > 0 ? 2 : 0, (d.tasa / max) * H);
        return <rect key={d.minuto} x={i * ancho + 1} y={H - h} width={ancho - 2} height={h} rx="1.5" fill={d.tasa > permitido ? '#B3261E' : '#2E7D6B'} opacity={d.validas ? 1 : 0.25}>
          <title>{new Date(d.minuto).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Guayaquil' })} · {d.validas} válidas · {d.errores5xx} errores 5xx</title>
        </rect>;
      })}
      <line x1="0" x2={W} y1={yPermitido} y2={yPermitido} stroke="#EAAA00" strokeWidth="2" strokeDasharray="6 4" />
      <text x={W - 4} y={yPermitido - 4} textAnchor="end" fontSize="11" fill="#7C4A03">error permitido por el SLO</text>
      <text x="0" y={H + 14} fontSize="11" fill="#6B7280">hace 30 min</text>
      <text x={W} y={H + 14} fontSize="11" fill="#6B7280" textAnchor="end">ahora</text>
    </svg>
  );
}

function Alerta({ titulo, activa, regla, texto, Ico }) {
  const I = activa ? Ico : BellOff;
  return (
    <div className="tarjeta" style={{ borderColor: activa ? '#f2c4ca' : 'var(--borde)' }}>
      <div className="tarjeta-cab">
        <h4 className="fila" style={{ gap: 8 }}><I size={18} aria-hidden /> {titulo}</h4>
        <span className={`etiqueta ${activa ? 'e-mal' : 'e-ok'}`}>{activa ? 'avisaría' : 'en calma'}</span>
      </div>
      <div className="tarjeta-cuerpo pila" style={{ gap: 6 }}>
        <p className="chico" style={{ margin: 0 }}><b>Regla:</b> {regla}</p>
        <p className="chico" style={{ margin: 0 }}>{texto}</p>
      </div>
    </div>
  );
}

export default function S9() {
  const [slo, setSlo] = useState(99.5);
  const { datos: d, error } = useSondeo('bce', `/v1/metricas?slo=${slo}`, 3000);
  const esDocente = Boolean(llaveDocente());
  const [crudo, setCrudo] = useState('');

  const caos = (cuerpo) => api('bce', '/v1/admin/caos', { method: 'PUT', body: cuerpo, docente: true });
  const trafico = async (n) => (await api('bce', '/v1/admin/demo/trafico', { method: 'POST', body: { n }, docente: true, timeoutMs: 90000 })).datos;
  const normal = useAccion(async () => { await caos({ tasaFalla: 0, latenciaMs: 0, disponible: true }); return trafico(40); });
  const falla = useAccion(async () => { await caos({ tasaFalla: 0.3, latenciaMs: 0, disponible: true }); return trafico(60); });
  const lento = useAccion(async () => { await caos({ tasaFalla: 0, latenciaMs: 1000, disponible: true }); return trafico(30); });
  const limpiar = useAccion(async () => {
    await caos({ tasaFalla: 0, latenciaMs: 0, disponible: true });
    await api('bce', '/v1/admin/demo/metricas/reiniciar', { method: 'POST', docente: true });
    return { ok: true };
  });
  const verCrudo = useAccion(async () => { const r = await api('bce', '/metrics'); setCrudo(String(r.datos)); return true; });
  const ocupado = normal.cargando || falla.cargando || lento.cargando || limpiar.cargando;
  const r = normal.resultado || falla.resultado || lento.resultado;

  return (
    <Estacion
      semana={9}
      titulo="Observabilidad: SLI, SLO y alertas"
      idea="«Está arriba» no es «está cumpliendo». El BCE ya cuenta cada petición real que atiende (la tuya, la de Faro y las de los otros equipos). Con esos contadores se calcula, en vivo, qué fracción del servicio cumple su promesa, cuánto presupuesto de error se está gastando y cuándo debería despertar a una persona."
      conceptos={[
        ['SLI y SLO', 'SLI = eventos buenos ÷ eventos válidos. SLO = la meta para ese SLI. Un rechazo de negocio (como una llave faltante) NO es un fallo del servicio: se excluye de los válidos.'],
        ['Ritmo de consumo', 'Error observado ÷ error permitido (1 − SLO). Ritmo 1 gasta el presupuesto justo en 30 días; ritmo 14,4 sostenido una hora gasta el 2 % del presupuesto del mes.'],
        ['Límites honestos', 'Los contadores viven en memoria: si Render duerme o reinicia el BCE, empiezan de cero (como un counter de Prometheus). Y un panel orienta, no concilia: el dinero exacto está en la base de datos.'],
      ]}
      codigo={[
        ['servicios/bce/src/metricas.js', 'Contadores, SLI, ritmo de consumo y el formato Prometheus'],
        ['servicios/bce/src/servidor.js', 'Dónde se instala la observabilidad (antes de las demás rutas)'],
        ['servicios/bce/src/comun/base.js', 'X-Correlation-Id: el identificador que une métricas, registros y trazas'],
      ]}
      proyecto="ADR-07: ¿qué SLI mide TU API frente al BCE? Si el BCE rechaza una operación por una regla, ¿es un fallo tuyo o una decisión correcta? Y si el BCE se cae, ¿gasta TU presupuesto de error?"
    >
      <Paso n={1} titulo="El SLI del BCE, en vivo" ayuda="Se actualiza cada 3 segundos con el tráfico real del BCE. Cambia el SLO y mira cómo cambia el veredicto con los mismos datos.">
        <div className="segmentado" role="tablist" aria-label="SLO">
          {[99, 99.5, 99.9].map((v) => <button key={v} role="tab" aria-selected={slo === v} onClick={() => setSlo(v)}>SLO {v.toLocaleString('es-EC')} %</button>)}
        </div>
        {error && !d && <Problema error={error} />}
        {!d && !error && <Cargando texto="Consultando las métricas del BCE…" />}
        {d && (
          <>
            {d.peticiones.total === 0 && <Aviso>Todavía no hay tráfico contado. {esDocente ? 'Genera tráfico en el paso 3.' : 'El docente generará tráfico en un momento.'}</Aviso>}
            <div className="rejilla r-2" style={{ marginTop: 10 }}>
              <div className="tarjeta kpi"><span className="etq">SLI disponibilidad</span>
                <div className="valor" style={{ color: d.sli.cumple === false ? 'var(--mal)' : 'var(--tinta)' }}>{pct(d.sli.disponibilidad)}</div>
                <span className="chico">{d.sli.cumple === null ? 'sin datos' : d.sli.cumple ? `cumple el ${slo.toLocaleString('es-EC')} %` : `NO cumple el ${slo.toLocaleString('es-EC')} %`}</span></div>
              <div className="tarjeta kpi"><span className="etq">SLI latencia (&lt; {d.sli.umbralLatenciaMs} ms)</span><div className="valor">{pct(d.sli.latencia)}</div><span className="chico">sobre todas las peticiones</span></div>
              <div className="tarjeta kpi"><span className="etq">Peticiones válidas</span><div className="valor">{d.peticiones.validas}</div><span className="chico">{d.peticiones.errores5xx} errores 5xx · {d.peticiones.rechazos4xx} rechazos 4xx aparte</span></div>
              <div className="tarjeta kpi"><span className="etq">Ritmo de consumo (1 h)</span>
                <div className="valor" style={{ color: (d.ritmoDeConsumo.h1 ?? 0) >= 1 ? 'var(--mal)' : 'var(--tinta)' }}>{num(d.ritmoDeConsumo.h1)}×</div>
                <span className="chico">{d.presupuestoDuraHoras.alRitmoDe1h ? `a este ritmo, el presupuesto de 30 días dura ${num(d.presupuestoDuraHoras.alRitmoDe1h)} h` : 'el presupuesto no se está agotando'}</span></div>
            </div>
            <div className="tarjeta" style={{ marginTop: 10 }}>
              <div className="tarjeta-cab"><h4 className="fila" style={{ gap: 8 }}><Gauge size={18} aria-hidden /> % de error por minuto (últimos 30 min)</h4><span className="chico">activo desde {new Date(d.iniciado).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Guayaquil' })}</span></div>
              <div className="tarjeta-cuerpo"><Barras serie={d.serie} permitido={d.errorPermitido} /></div>
            </div>
            <p className="chico" style={{ marginTop: 8 }}>{d.nota}</p>
          </>
        )}
      </Paso>

      <Paso n={2} titulo="¿A quién despertaría cada regla?" ayuda="Las mismas cifras, tres reglas. La ingenua suena por casi todo; las de ritmo de consumo esperan a que el gasto sea serio.">
        {d ? (
          <div className="rejilla r-3">
            <Alerta Ico={Bell} titulo="Ingenua" activa={d.alertas.ingenua.activa} regla={d.alertas.ingenua.regla} texto="Con poco tráfico, un solo fallo ya es un porcentaje enorme: despierta a alguien por un cobro." />
            <Alerta Ico={BellRing} titulo="Página" activa={d.alertas.pagina.activa} regla={d.alertas.pagina.regla} texto="Despierta a una persona: el presupuesto se está gastando muy rápido y sigue pasando." />
            <Alerta Ico={Flame} titulo="Ticket" activa={d.alertas.ticket.activa} regla={d.alertas.ticket.regla} texto="Se atiende en horario laboral: una fuga lenta que, sostenida, agotaría el presupuesto." />
          </div>
        ) : <Cargando texto="Esperando las métricas…" />}
      </Paso>

      <Paso n={3} titulo="Provoca un incidente" ayuda={esDocente ? 'Usa el caos controlado del BCE y genera tráfico real contra él. Ojo: el BCE lo usan los cuatro equipos; restablece al terminar.' : 'El docente provoca el incidente desde su dispositivo; míralo en los pasos 1 y 2.'}>
        {esDocente ? (
          <>
            <div className="rejilla r-2">
              <button className="boton sec bloque" onClick={() => normal.ejecutar()} disabled={ocupado}><RefreshCw size={16} aria-hidden /> Tráfico normal (40)</button>
              <button className="boton peligro bloque" onClick={() => falla.ejecutar()} disabled={ocupado}><Zap size={16} aria-hidden /> Falla del 30 % + tráfico (60)</button>
              <button className="boton peligro bloque" onClick={() => lento.ejecutar()} disabled={ocupado}><TimerReset size={16} aria-hidden /> Lentitud de 1 s + tráfico (30)</button>
              <button className="boton bloque" onClick={() => limpiar.ejecutar()} disabled={ocupado}><RefreshCw size={16} aria-hidden /> Restablecer y poner en cero</button>
            </div>
            {ocupado && <Cargando texto="Generando tráfico contra el BCE…" />}
            {r && <Aviso titulo="Tráfico generado">{r.n} peticiones: {r.ok} buenas, {r.rechazosNegocio} rechazos de negocio (no cuentan como fallo), {r.fallas} fallas del servicio.</Aviso>}
            {limpiar.resultado && <Aviso tono="ok" titulo="Restablecido">El caos quedó apagado y los contadores en cero.</Aviso>}
            <Problema error={normal.error || falla.error || lento.error || limpiar.error} />
            <Aviso>Con «Lentitud», el SLI de latencia cae pero el de disponibilidad no: todas las respuestas fueron correctas, solo tardaron. Un SLI puede cumplirse mientras otro falla.</Aviso>
          </>
        ) : <Aviso>El docente dirige esta parte desde su sesión.</Aviso>}
      </Paso>

      <Paso n={4} titulo="Lo que Prometheus vendría a buscar" ayuda="El BCE publica sus contadores en el formato de texto de Prometheus. Un Prometheus real los recogería cada 15 segundos (modelo «pull»).">
        <button className="boton sec" onClick={() => verCrudo.ejecutar()} disabled={verCrudo.cargando}><FileText size={16} aria-hidden /> Ver /metrics del BCE</button>
        {crudo && <pre className="chico" style={{ marginTop: 10, overflow: 'auto', maxHeight: 320, background: 'var(--sup-2)', padding: 12, borderRadius: 8 }}>{crudo}</pre>}
        <Problema error={verCrudo.error} />
        <p className="chico">Cada línea es una serie. Fíjate en las etiquetas: <code>ruta</code> y <code>clase</code> tienen pocos valores a propósito. Una etiqueta «cuenta» crearía una serie por persona: caro y un problema de privacidad.</p>
      </Paso>
    </Estacion>
  );
}
