import { useState } from 'react';
import { Play } from 'lucide-react';
import { Estacion, Paso, Opciones, Problema, EtiquetaEstado, Cargando } from '../componentes/comunes.jsx';
import { api, dinero, hora } from '../api.js';
import { useAccion, useSondeo } from '../hooks.js';

const CSV_EJEMPLO = 'beneficiario,monto\nPRV-DEMO,1.00';

function Hexagono({ canal }) {
  const on = (c) => (canal === c ? '#FFF6DC' : '#FFFFFF');
  const borde = (c) => (canal === c ? '#EAAA00' : '#CDD6E0');
  const activo = !!canal;
  return (
    <svg viewBox="0 0 560 240" style={{ width: '100%', maxWidth: 620, margin: '0 auto' }} role="img" aria-label="Arquitectura hexagonal de Faro">
      <polygon points="280,16 400,64 400,176 280,224 160,176 160,64" fill="#F7F9FB" stroke="#12355B" strokeWidth="2" />
      <polygon points="280,72 336,96 336,148 280,172 224,148 224,96" fill={activo ? '#FFF6DC' : '#FFFFFF'} stroke={activo ? '#EAAA00' : '#CDD6E0'} strokeWidth="2" />
      <text x="280" y="118" textAnchor="middle" fontWeight="700" fontSize="13" fill="#0F1F33">Caso de uso</text>
      <text x="280" y="136" textAnchor="middle" fontSize="12" fill="#44566B">crearLote()</text>
      <text x="64" y="40" textAnchor="middle" fontSize="11" fill="#6B7A8C">Entradas</text>
      {[['PWA', 'Pantalla / JSON', 60], ['CSV', 'Archivo CSV', 150]].map(([c, t, y]) => (
        <g key={c}>
          <rect x="8" y={y} width="112" height="40" rx="8" fill={on(c)} stroke={borde(c)} strokeWidth="1.5" />
          <text x="64" y={y + 25} textAnchor="middle" fontSize="12" fill="#0F1F33">{t}</text>
          <path d={`M120 ${y + 20} L224 ${c === 'PWA' ? 110 : 134}`} stroke={canal === c ? '#EAAA00' : '#CDD6E0'} strokeWidth="2" />
        </g>
      ))}
      <text x="496" y="24" textAnchor="middle" fontSize="11" fill="#6B7A8C">Salidas</text>
      {[['Banco Andino', 36], ['BCE', 100], ['PostgreSQL', 164]].map(([t, y]) => (
        <g key={t}>
          <rect x="440" y={y} width="112" height="40" rx="8" fill={activo ? '#FFF6DC' : '#FFFFFF'} stroke={activo ? '#EAAA00' : '#CDD6E0'} strokeWidth="1.5" />
          <text x="496" y={y + 25} textAnchor="middle" fontSize="12" fill="#0F1F33">{t}</text>
          <path d={`M336 122 L440 ${y + 20}`} stroke={activo ? '#EAAA00' : '#CDD6E0'} strokeWidth="2" />
        </g>
      ))}
    </svg>
  );
}

export default function S2() {
  const [puerta, setPuerta] = useState('PWA');
  const [canal, setCanal] = useState(null);
  const [loteId, setLoteId] = useState(null);
  const [csv, setCsv] = useState(CSV_EJEMPLO);

  const enviar = useAccion(async () => {
    const r = puerta === 'PWA'
      ? await api('faro', '/v1/lotes', { method: 'POST', headers: { 'x-canal': 'PWA' }, body: { tipo: 'URGENTE', descripcion: 'Desde la pantalla', pagos: [{ beneficiarioId: 'PRV-DEMO', monto: 1 }] } })
      : await api('faro', '/v1/lotes/csv?tipo=URGENTE', { method: 'POST', texto: true, body: csv, headers: { 'content-type': 'text/csv', 'idempotency-key': `csv-${crypto.randomUUID()}` } });
    setCanal(puerta); setLoteId(r.datos.loteId); return r.datos;
  });
  const escritura = useSondeo('faro', loteId ? `/v1/lotes/${loteId}` : null, 1200, !!loteId);
  const lectura = useSondeo('faro', '/v1/reportes/lotes', 2000, !!loteId);
  const filaLectura = lectura.datos?.lotes?.find((l) => l.lote_id === loteId);

  return (
    <Estacion
      semana={2}
      titulo="Hexagonal y CQRS"
      idea="El núcleo del negocio no sabe por dónde llegó el pedido ni dónde se guarda. Y los reportes no leen la misma tabla con la que se escribe."
      conceptos={[
        ['Arquitectura hexagonal', 'Las reglas del negocio están al centro. Pantallas, archivos y APIs son adaptadores de entrada; bancos y bases de datos, adaptadores de salida. Se cambian sin tocar el centro.'],
        ['CQRS', 'Comandos (escribir) y consultas (leer) usan modelos distintos. El modelo de lectura se actualiza un instante después: consistencia eventual.'],
      ]}
      codigo={[
        ['servicios/faro-api/src/adaptadores/entrada/rest.js', 'Las dos puertas: /v1/lotes y /v1/lotes/csv'],
        ['servicios/faro-api/src/aplicacion/casosDeUso.js', 'crearLote() y el proyector CQRS'],
        ['servicios/faro-api/src/dominio/reglas.js', 'Reglas puras del negocio'],
      ]}
      proyecto="Nombra dos adaptadores de entrada y tres de salida de tu proyecto. ¿Qué reporte justificaría separar lectura y escritura?"
    >
      <Paso n={1} titulo="Elige por qué puerta entra el pago" ayuda="Ambas crean un pago de 1 dólar a la cuenta demo.">
        <Opciones valor={puerta} onCambio={setPuerta} etiqueta="Puerta de entrada" opciones={[
          { id: 'PWA', titulo: 'Pantalla (JSON)', texto: 'Como cuando el usuario pulsa "Pagar" en la app.' },
          { id: 'CSV', titulo: 'Archivo CSV', texto: 'Como cuando la empresa sube el archivo de nómina al banco.' },
        ]} />
        {puerta === 'CSV' && (
          <label className="campo" style={{ marginTop: 12 }}>
            Contenido del archivo
            <textarea rows={3} value={csv} onChange={(e) => setCsv(e.target.value)} />
          </label>
        )}
      </Paso>
      <Paso n={2} titulo="Ejecuta">
        <div className="accion">
          <button className="boton grande" onClick={enviar.ejecutar} disabled={enviar.cargando}><Play size={18} aria-hidden /> {puerta === 'PWA' ? 'Pagar desde la pantalla' : 'Subir el archivo'}</button>
          {enviar.cargando && <Cargando />}
        </div>
        {enviar.error && <div style={{ marginTop: 12 }}><Problema error={enviar.error} /></div>}
      </Paso>
      <Paso n={3} titulo="Resultado" ayuda={loteId ? 'Las dos puertas llegan al mismo caso de uso.' : 'Aquí se ilumina el camino que siguió tu pedido.'} activo={!!loteId}>
        <div className="pila">
          <Hexagono canal={canal} />
          {loteId && (
            <div className="rejilla r-2">
              <div className="tarjeta tarjeta-cuerpo pila" style={{ gap: 8 }}>
                <div className="fila entre"><h4>Escritura (comando)</h4><span className="chico">faro.pagos</span></div>
                {escritura.datos ? (
                  <>
                    <div className="fila entre"><span>Canal</span><b>{escritura.datos.canal}</b></div>
                    <div className="fila entre"><span>Estado</span><EtiquetaEstado estado={escritura.datos.estado} /></div>
                    {escritura.datos.pagos.map((p) => <div key={p.id} className="fila entre"><span>{dinero(p.monto)} · {p.beneficiario}</span><EtiquetaEstado estado={p.estado} /></div>)}
                  </>
                ) : <Cargando texto="Leyendo…" />}
              </div>
              <div className="tarjeta tarjeta-cuerpo pila" style={{ gap: 8 }}>
                <div className="fila entre"><h4>Lectura (consulta)</h4><span className="chico">vista_reporte_lotes</span></div>
                {filaLectura ? (
                  <>
                    <div className="fila entre"><span>Estado</span><EtiquetaEstado estado={filaLectura.estado} /></div>
                    <div className="fila entre"><span>Liquidado</span><b>{dinero(filaLectura.monto_liquidado)} de {dinero(filaLectura.monto_total)}</b></div>
                    <div className="fila entre"><span>Actualizado</span><span>{hora(filaLectura.actualizado)}</span></div>
                  </>
                ) : <p className="chico">Aún no aparece: la proyección llega un instante después.</p>}
              </div>
            </div>
          )}
        </div>
      </Paso>
    </Estacion>
  );
}
