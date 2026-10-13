import { useState } from 'react';
import { Estacion, Problema, EtiquetaEstado, Cargando } from '../componentes/comunes.jsx';
import { api, dinero, hora } from '../api.js';
import { useAccion, useSondeo } from '../hooks.js';

const CSV_EJEMPLO = 'beneficiario,monto\nPRV-DEMO,1.00';

/** Hexágono: se ilumina el camino que siguió el último pedido. */
function Hexagono({ canal }) {
  const on = (c) => (canal === c ? 'hex-paso hex-activo' : 'hex-paso');
  const nucleo = canal ? 'hex-paso hex-activo' : 'hex-paso';
  return (
    <svg viewBox="0 0 520 250" style={{ width: '100%', maxWidth: 560 }} role="img" aria-label="Arquitectura hexagonal de Faro">
      <polygon points="260,20 380,70 380,180 260,230 140,180 140,70" fill="#FBFDFC" stroke="#102A43" strokeWidth="2.5" />
      <polygon points="260,70 320,95 320,155 260,180 200,155 200,95" className={nucleo} fill="#E2EAE9" stroke="#33506B" strokeWidth="2" />
      <text x="260" y="122" textAnchor="middle" fontWeight="700" fontSize="13" fill="#102A43">Caso de uso</text>
      <text x="260" y="140" textAnchor="middle" fontSize="12" fill="#33506B">crearLote()</text>
      {/* entradas */}
      <rect x="6" y="62" width="110" height="40" rx="6" className={on('PWA')} fill="#FBFDFC" stroke="#5B7083" />
      <text x="61" y="87" textAnchor="middle" fontSize="12" fill="#102A43">Pantalla / JSON</text>
      <rect x="6" y="150" width="110" height="40" rx="6" className={on('CSV')} fill="#FBFDFC" stroke="#5B7083" />
      <text x="61" y="175" textAnchor="middle" fontSize="12" fill="#102A43">Archivo CSV</text>
      <path d="M116 82 L200 112" stroke="#5B7083" strokeWidth="2" strokeDasharray={canal === 'PWA' ? '' : '4 4'} />
      <path d="M116 170 L200 140" stroke="#5B7083" strokeWidth="2" strokeDasharray={canal === 'CSV' ? '' : '4 4'} />
      {/* salidas */}
      {[['Banco Andino', 40], ['BCE', 105], ['PostgreSQL', 170]].map(([t, y]) => (
        <g key={t}>
          <rect x="404" y={y} width="110" height="40" rx="6" className={nucleo} fill="#FBFDFC" stroke="#5B7083" />
          <text x="459" y={y + 25} textAnchor="middle" fontSize="12" fill="#102A43">{t}</text>
          <path d={`M320 125 L404 ${y + 20}`} stroke="#5B7083" strokeWidth="2" strokeDasharray={canal ? '' : '4 4'} />
        </g>
      ))}
      <text x="61" y="40" textAnchor="middle" fontSize="11" fill="#5B7083">Adaptadores de entrada</text>
      <text x="459" y="24" textAnchor="middle" fontSize="11" fill="#5B7083">Adaptadores de salida</text>
    </svg>
  );
}

export default function S2() {
  const [canal, setCanal] = useState(null);
  const [loteId, setLoteId] = useState(null);
  const [csv, setCsv] = useState(CSV_EJEMPLO);

  const porPantalla = useAccion(async () => {
    const r = await api('faro', '/v1/lotes', {
      method: 'POST', headers: { 'x-canal': 'PWA' },
      body: { tipo: 'URGENTE', descripcion: 'Desde la pantalla', pagos: [{ beneficiarioId: 'PRV-DEMO', monto: 1 }] },
    });
    setCanal('PWA'); setLoteId(r.datos.loteId); return r.datos;
  });
  const porCsv = useAccion(async () => {
    const r = await api('faro', '/v1/lotes/csv?tipo=URGENTE', {
      method: 'POST', texto: true, body: csv, headers: { 'content-type': 'text/csv', 'idempotency-key': `csv-${crypto.randomUUID()}` },
    });
    setCanal('CSV'); setLoteId(r.datos.loteId); return r.datos;
  });

  const escritura = useSondeo('faro', loteId ? `/v1/lotes/${loteId}` : null, 1200, !!loteId);
  const lectura = useSondeo('faro', '/v1/reportes/lotes', 2000);
  const filaLectura = lectura.datos?.lotes?.find((l) => l.lote_id === loteId);

  return (
    <Estacion
      semana={2}
      titulo="Hexagonal y CQRS"
      idea="El núcleo del negocio no sabe por dónde llegó el pedido ni a dónde se guarda. Dos puertas distintas, un solo caso de uso. Y para leer reportes no se usa la misma tabla con la que se escribe."
      explicacion={<>
        <div>
          <h3>Hexagonal</h3>
          <p style={{ margin: 0 }}>La pantalla y el archivo CSV son <b>adaptadores de entrada</b>. Ambos llaman a <code>crearLote()</code>. Si mañana llega WhatsApp, se agrega otro adaptador sin tocar las reglas del negocio.</p>
        </div>
        <div>
          <h3>CQRS</h3>
          <p style={{ margin: 0 }}>El <b>comando</b> escribe en <code>faro.lotes</code> y <code>faro.pagos</code>. Un proyector actualiza <code>faro.vista_reporte_lotes</code>, que es lo que leen los reportes. Va unos milisegundos atrás: eso es consistencia eventual.</p>
        </div>
      </>}
      codigo={[
        ['servicios/faro-api/src/adaptadores/entrada/rest.js', 'Las dos puertas: /v1/lotes y /v1/lotes/csv'],
        ['servicios/faro-api/src/aplicacion/casosDeUso.js', 'crearLote() y el proyector CQRS'],
        ['servicios/faro-api/src/dominio/reglas.js', 'Reglas puras del negocio'],
      ]}
      proyecto="Nombra dos adaptadores de entrada y tres de salida de tu proyecto. ¿Qué pantalla de reportes justificaría separar lectura y escritura?"
    >
      <h2>Paga 1 dólar por dos puertas distintas</h2>
      <Hexagono canal={canal} />
      <div className="rejilla" style={{ marginTop: 12 }}>
        <div className="hoja">
          <h3>Puerta 1 · Pantalla (JSON)</h3>
          <p className="chico">Envía <code>POST /v1/lotes</code> con un pago a la cuenta demo.</p>
          <button className="boton" disabled={porPantalla.cargando} onClick={porPantalla.ejecutar}>Pagar desde la pantalla</button>
        </div>
        <div className="hoja">
          <h3>Puerta 2 · Archivo CSV</h3>
          <textarea rows={3} value={csv} onChange={(e) => setCsv(e.target.value)} aria-label="Contenido del archivo CSV" />
          <button className="boton claro" style={{ marginTop: 8 }} disabled={porCsv.cargando} onClick={porCsv.ejecutar}>Subir el archivo</button>
        </div>
      </div>
      <Problema error={porPantalla.error || porCsv.error} />
      {(porPantalla.cargando || porCsv.cargando) && <Cargando />}

      {loteId && (
        <div className="rejilla" style={{ marginTop: 14 }}>
          <div className="hoja">
            <h3>Lado de escritura (comando)</h3>
            <p className="chico">faro.lotes + faro.pagos</p>
            {escritura.datos ? (
              <>
                <p>Canal: <b>{escritura.datos.canal}</b> · <EtiquetaEstado estado={escritura.datos.estado} /></p>
                {escritura.datos.pagos.map((p) => (
                  <p key={p.id} className="chico" style={{ margin: 0 }}>{p.beneficiario}: {dinero(p.monto)} <EtiquetaEstado estado={p.estado} /></p>
                ))}
              </>
            ) : <Cargando texto="Leyendo…" />}
          </div>
          <div className="hoja">
            <h3>Lado de lectura (consulta)</h3>
            <p className="chico">faro.vista_reporte_lotes</p>
            {filaLectura ? (
              <>
                <p>Estado: <EtiquetaEstado estado={filaLectura.estado} /></p>
                <p className="chico" style={{ margin: 0 }}>Liquidado {dinero(filaLectura.monto_liquidado)} de {dinero(filaLectura.monto_total)} · actualizado {hora(filaLectura.actualizado)}</p>
              </>
            ) : <p className="chico">Todavía no aparece aquí: la proyección llega un instante después.</p>}
          </div>
        </div>
      )}
    </Estacion>
  );
}
