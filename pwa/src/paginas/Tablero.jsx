import { useRef } from 'react';
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
const TONO = { TRANSFERENCIA_LIQUIDADA: 'e-ok', TRANSFERENCIA_RECHAZADA: 'e-mal', REPETICION_DETECTADA: 'e-luz', SIN_IDEMPOTENCY_KEY: 'e-mal', LLAVE_REUTILIZADA: 'e-mal', LLAVE_API_INVALIDA: 'e-mal', WEBHOOK_FALLIDO: 'e-espera' };

export default function Tablero() {
  const t = useSondeo('bce', '/v1/tablero', 3000);
  const p = useSondeo('bce', '/v1/participantes', 5000);
  const vistos = useRef(new Set());
  const primera = useRef(true);
  if (!t.datos) return <><h1>Tablero del BCE</h1>{t.error ? <Problema error={t.error} /> : <Cargando texto="Conectando con el BCE…" />}</>;
  const { metricas, eventos, cumplimiento } = t.datos;
  const nuevos = new Set(primera.current ? [] : eventos.filter((e) => !vistos.current.has(e.id)).map((e) => e.id));
  eventos.forEach((e) => vistos.current.add(e.id));
  primera.current = false;

  return (
    <>
      <h1>Tablero del BCE</h1>
      <p className="idea" style={{ marginTop: 8 }}>Todo lo que los participantes envían al Banco Central simulado, en vivo. Aquí se ve qué equipo cumple el contrato.</p>

      <div className="rejilla" style={{ marginTop: 16 }}>
        <div className="hoja"><div className="cifra">{metricas.liquidadas}</div><span className="chico">transferencias liquidadas</span></div>
        <div className="hoja"><div className="cifra">{dinero(metricas.montoLiquidado)}</div><span className="chico">liquidado en total</span></div>
        <div className="hoja"><div className="cifra">{metricas.rechazadas}</div><span className="chico">rechazadas con motivo ISO</span></div>
      </div>

      <div className="seccion rejilla" style={{ alignItems: 'start' }}>
        <div className="hoja">
          <h2 style={{ fontSize: '1.3rem' }}>Participantes</h2>
          <div className="desliza">
            <table className="tabla" style={{ marginTop: 8 }}>
              <thead><tr><th>Código</th><th>Conexión</th><th className="num">Enviadas</th><th className="num">Recibidas</th></tr></thead>
              <tbody>
                {(p.datos || []).map((x) => (
                  <tr key={x.codigo}>
                    <td><b>{x.codigo}</b><div className="chico">{x.nombre}</div></td>
                    <td>{x.ultima_conexion
                      ? <span className="etiqueta e-ok">{hora(x.ultima_conexion)}</span>
                      : x.tipo === 'EQUIPO_CURSO' ? <span className="etiqueta">Sin conectar</span> : <span className="etiqueta e-luz">Interno</span>}
                      {x.tiene_webhook && <div className="chico">con webhook</div>}
                    </td>
                    <td className="num">{x.enviadas}</td>
                    <td className="num">{x.recibidas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cumplimiento.length > 0 && (
            <>
              <h3 style={{ marginTop: 18 }}>Cumplimiento del contrato</h3>
              <div className="desliza"><table className="tabla" style={{ marginTop: 6 }}>
                <thead><tr><th>Participante</th><th className="num">Reintentos bloqueados</th><th className="num">Sin llave</th><th className="num">Llave reutilizada</th></tr></thead>
                <tbody>{cumplimiento.map((c) => (
                  <tr key={c.participante}><td>{c.participante}</td><td className="num">{c.repeticionesBloqueadas}</td><td className="num">{c.sinLlave}</td><td className="num">{c.llaveReutilizada}</td></tr>
                ))}</tbody>
              </table></div>
            </>
          )}
        </div>

        <div className="hoja">
          <h2 style={{ fontSize: '1.3rem' }}>Lo último que pasó</h2>
          <ul className="feed" aria-live="polite">
            {eventos.map((e) => (
              <li key={e.id} className={nuevos.has(e.id) ? 'nuevo' : ''}>
                <span className="chico">{hora(e.creado)}</span>
                <span>
                  <span className={`etiqueta ${TONO[e.tipo] || ''}`}>{e.participante || 'desconocido'}</span>{' '}
                  {(TEXTO[e.tipo] || (() => e.tipo))(e.detalle || {})}
                </span>
              </li>
            ))}
            {eventos.length === 0 && <li><span /> <span className="chico">Todavía no hay movimientos. Prueba la estación de idempotencia.</span></li>}
          </ul>
        </div>
      </div>
      <p className="chico" style={{ marginTop: 14 }}>Caché de idempotencia: {t.datos.cacheIdempotencia} · Contrato: <a href={`${URLS.bce}/docs`} target="_blank" rel="noreferrer">{URLS.bce}/docs</a></p>
    </>
  );
}
