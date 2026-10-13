import { useRef } from 'react';
import { ExternalLink } from 'lucide-react';
import { Cargando, Problema } from '../componentes/comunes.jsx';
import { dinero, hora, URLS } from '../api.js';
import { useSondeo } from '../hooks.js';

const TEXTO = {
  TRANSFERENCIA_LIQUIDADA: (d) => `Liquidó ${dinero(d.monto)} hacia ${d.destino}`,
  TRANSFERENCIA_RECHAZADA: (d) => `Rechazada hacia ${d.destino} (${d.motivo})`,
  REPETICION_DETECTADA: () => 'Reintento detectado: no se cobró dos veces',
  SIN_IDEMPOTENCY_KEY: () => 'Envió una orden sin Idempotency-Key',
  LLAVE_REUTILIZADA: () => 'Reutilizó una llave con otro contenido',
  LLAVE_API_INVALIDA: () => 'Intento con una llave de API inválida',
  CONEXION: () => 'Se conectó y probó su llave',
  WEBHOOK_REGISTRADO: () => 'Registró su webhook',
  WEBHOOK_ENTREGADO: () => 'Recibió el aviso en su webhook',
  WEBHOOK_FALLIDO: () => 'Su webhook no respondió',
};
const TONO = { TRANSFERENCIA_LIQUIDADA: 'e-ok', TRANSFERENCIA_RECHAZADA: 'e-mal', REPETICION_DETECTADA: 'e-luz', SIN_IDEMPOTENCY_KEY: 'e-mal', LLAVE_REUTILIZADA: 'e-mal', LLAVE_API_INVALIDA: 'e-mal', WEBHOOK_FALLIDO: 'e-espera', CONEXION: 'e-ok' };

export default function Tablero() {
  const t = useSondeo('bce', '/v1/tablero', 3000);
  const p = useSondeo('bce', '/v1/participantes', 5000);
  const vistos = useRef(new Set());
  const primera = useRef(true);

  const encabezado = (
    <header className="encabezado">
      <h1>Tablero del BCE</h1>
      <p className="lead">Todo lo que los participantes envían al Banco Central simulado, en vivo. Aquí se ve qué equipo cumple el contrato.</p>
    </header>
  );
  if (!t.datos) return <>{encabezado}{t.error ? <Problema error={t.error} /> : <Cargando texto="Conectando con el BCE…" />}</>;

  const { metricas, eventos, cumplimiento } = t.datos;
  const nuevos = new Set(primera.current ? [] : eventos.filter((e) => !vistos.current.has(e.id)).map((e) => e.id));
  eventos.forEach((e) => vistos.current.add(e.id));
  primera.current = false;

  return (
    <>
      {encabezado}
      <div className="pila" style={{ gap: 20 }}>
        <div className="rejilla r-3">
          <div className="tarjeta kpi"><span className="etq">Transferencias liquidadas</span><div className="valor">{metricas.liquidadas}</div></div>
          <div className="tarjeta kpi"><span className="etq">Monto liquidado</span><div className="valor">{dinero(metricas.montoLiquidado)}</div></div>
          <div className="tarjeta kpi"><span className="etq">Rechazadas con motivo ISO</span><div className="valor">{metricas.rechazadas}</div></div>
        </div>

        <div className="estacion">
          <div className="tarjeta">
            <div className="tarjeta-cab"><div><h3>Lo último que pasó</h3><p>Se actualiza cada 3 segundos</p></div></div>
            <div className="tarjeta-cuerpo" style={{ paddingTop: 4, paddingBottom: 4 }}>
              <ul className="feed" aria-live="polite">
                {eventos.map((e) => (
                  <li key={e.id} className={nuevos.has(e.id) ? 'nuevo' : ''}>
                    <span className="chico">{hora(e.creado)}</span>
                    <span className="fila" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                      <span className={`etiqueta ${TONO[e.tipo] || ''}`}>{e.participante || '—'}</span>
                      <span>{(TEXTO[e.tipo] || (() => e.tipo))(e.detalle || {})}</span>
                    </span>
                  </li>
                ))}
                {eventos.length === 0 && <li><span /><span className="chico">Todavía no hay movimientos. Prueba la estación S4.</span></li>}
              </ul>
            </div>
          </div>

          <div className="pila">
            <div className="tarjeta">
              <div className="tarjeta-cab"><h3>Participantes</h3></div>
              <div className="tarjeta-cuerpo pila" style={{ gap: 12 }}>
                {(p.datos || []).map((x) => (
                  <div key={x.codigo} className="fila entre" style={{ flexWrap: 'nowrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <b style={{ fontSize: 14 }}>{x.codigo}</b>
                      <div className="chico">{x.enviadas} enviadas · {x.recibidas} recibidas · liquidación {dinero(x.saldo_liquidacion)}</div>
                    </div>
                    {x.ultima_conexion
                      ? <span className="etiqueta e-ok">{hora(x.ultima_conexion)}</span>
                      : x.tipo === 'EQUIPO_CURSO' ? <span className="etiqueta">Sin conectar</span> : <span className="etiqueta e-luz">Interno</span>}
                  </div>
                ))}
              </div>
            </div>
            {cumplimiento.length > 0 && (
              <div className="tarjeta">
                <div className="tarjeta-cab"><h3>Cumplimiento</h3></div>
                <div className="tarjeta-cuerpo pila" style={{ gap: 10 }}>
                  {cumplimiento.map((c) => (
                    <div key={c.participante} className="pila" style={{ gap: 4 }}>
                      <b style={{ fontSize: 14 }}>{c.participante}</b>
                      <div className="fila">
                        <span className="etiqueta e-luz">{c.repeticionesBloqueadas} reintentos bloqueados</span>
                        {c.sinLlave > 0 && <span className="etiqueta e-mal">{c.sinLlave} sin llave</span>}
                        {c.llaveReutilizada > 0 && <span className="etiqueta e-mal">{c.llaveReutilizada} llave reutilizada</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <a className="boton sec" href={`${URLS.bce}/docs`} target="_blank" rel="noreferrer"><ExternalLink size={16} aria-hidden /> Contrato del BCE</a>
            <span className="chico">Caché de idempotencia: {t.datos.cacheIdempotencia}</span>
          </div>
        </div>
      </div>
    </>
  );
}
