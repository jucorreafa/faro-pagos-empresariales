import { useState } from 'react';
import { Play, ExternalLink } from 'lucide-react';
import { Estacion, Paso, Opciones, FlujoPago, Problema, EtiquetaEstado, Cargando, Aviso } from '../componentes/comunes.jsx';
import { api, dinero, URLS } from '../api.js';
import { useAccion } from '../hooks.js';

const ESCENARIOS = [
  { id: 'MISMA_LLAVE', titulo: 'Reintento con la misma llave', texto: 'No llegó la respuesta y el cliente reenvía el mismo pago con la misma Idempotency-Key.' },
  { id: 'LLAVES_DISTINTAS', titulo: 'Reintento con llave nueva', texto: 'El reintento genera otra llave. Error común de programación.' },
  { id: 'LLAVE_REUTILIZADA', titulo: 'Misma llave, otro monto', texto: 'Se reutiliza una llave vieja para un pago diferente.' },
  { id: 'SIN_LLAVE', titulo: 'Sin llave', texto: 'La orden llega al BCE sin la cabecera Idempotency-Key.' },
];

const CONCLUSION = {
  MISMA_LLAVE: ['ok', 'Se cobró una sola vez', 'El BCE reconoció la llave y devolvió la misma respuesta (Idempotent-Replayed). Reintentar es seguro.'],
  LLAVES_DISTINTAS: ['mal', 'Doble cobro', 'Con llaves distintas el BCE no puede saber que era el mismo pago. La llave se genera UNA vez por pago y se guarda.'],
  LLAVE_REUTILIZADA: ['ok', 'El segundo pago fue bloqueado', 'El BCE detectó que la llave ya se usó con otro contenido y respondió 422.'],
  SIN_LLAVE: ['ok', 'Rechazado antes de mover dinero', 'El BCE exige la llave y responde 400. Ningún centavo se movió.'],
};

function nodosDelResultado(r) {
  const liquidadas = r.intentos.filter((i) => i.http === 201).length;
  const bloqueadas = r.intentos.filter((i) => i.http >= 400).length;
  const repetidas = r.intentos.filter((i) => i.repetida).length;
  const notaBce = [
    liquidadas && `${liquidadas} liquidada${liquidadas > 1 ? 's' : ''}`,
    repetidas && `${repetidas} repetida`,
    bloqueadas && `${bloqueadas} bloqueada${bloqueadas > 1 ? 's' : ''}`,
  ].filter(Boolean).join(' · ');
  return [
    { id: 'faro', nombre: 'Faro', nota: `${r.intentos.length} envío${r.intentos.length > 1 ? 's' : ''}`, estado: 'ok' },
    { id: 'bce', nombre: 'BCE', nota: notaBce, estado: liquidadas ? (liquidadas > 1 ? 'mal' : 'ok') : 'mal', conector: 'ok' },
    { id: 'banco', nombre: 'Banco Andino', nota: liquidadas ? `${liquidadas} crédito${liquidadas > 1 ? 's' : ''}` : 'sin movimiento', estado: liquidadas ? (liquidadas > 1 ? 'mal' : 'ok') : 'omitido', conector: liquidadas ? (liquidadas > 1 ? 'mal' : 'ok') : '' },
  ];
}

export default function S4() {
  const [escenario, setEscenario] = useState('MISMA_LLAVE');
  const [xml, setXml] = useState(null);
  const demo = useAccion(async () => {
    setXml(null);
    return (await api('faro', '/v1/demo/idempotencia', { method: 'POST', body: { escenario } })).datos;
  });
  const verXml = useAccion(async (id, mensaje) => {
    const r = await api('bce', `/v1/transferencias/${id}/iso20022?mensaje=${mensaje}`);
    setXml({ mensaje, texto: r.datos }); return true;
  });
  const r = demo.resultado;
  const idTransf = r?.intentos?.find((i) => i.respuesta?.transferenciaId)?.respuesta.transferenciaId;
  const conc = r && CONCLUSION[r.escenario];

  return (
    <Estacion
      semana={4}
      titulo="Contratos, idempotencia e ISO 20022"
      idea="Si la red se corta a mitad de un pago, el cliente reintenta. La Idempotency-Key garantiza que reintentar no cobre dos veces."
      conceptos={[
        ['Idempotencia', 'Hacer la misma operación varias veces produce el mismo resultado que hacerla una vez. En pagos, evita el doble cobro.'],
        ['ISO 20022', 'El BCE recibe un pacs.008 (orden de pago) y responde con un pacs.002 (estado): ACSC liquidada, RJCT rechazada.'],
        ['Contrato y errores', 'Cada servicio publica su OpenAPI en /docs. Los errores siguen RFC 9457: title, status, detail, código y correlationId.'],
      ]}
      codigo={[
        ['servicios/bce/src/servidor.js', 'POST /v1/transferencias: llave, caché, candado y UNIQUE'],
        ['servicios/bce/src/iso20022.js', 'pacs.008 y pacs.002 en XML'],
        ['servicios/bce/src/cache.js', 'Redis con plan B en memoria'],
      ]}
      proyecto="En tu API: ¿quién genera la Idempotency-Key, dónde se guarda y cuánto dura? Escribe un error de tu dominio en formato problem+json."
    >
      <Paso n={1} titulo="Elige un escenario" ayuda="Faro enviará al BCE un pago de 1 dólar hacia la cuenta demo, dos veces.">
        <Opciones opciones={ESCENARIOS} valor={escenario} onCambio={(v) => { setEscenario(v); demo.setResultado(null); }} etiqueta="Escenario" />
      </Paso>

      <Paso n={2} titulo="Ejecuta" ayuda="Las llamadas son reales: viajan de Faro al BCE y al Banco Andino.">
        <div className="accion">
          <button className="boton grande" onClick={demo.ejecutar} disabled={demo.cargando}><Play size={18} aria-hidden /> Enviar al BCE</button>
          {demo.cargando && <Cargando texto="Enviando…" />}
          <a className="boton sec" href={`${URLS.bce}/docs`} target="_blank" rel="noreferrer"><ExternalLink size={16} aria-hidden /> Ver contrato del BCE</a>
        </div>
        {demo.error && <div style={{ marginTop: 12 }}><Problema error={demo.error} /></div>}
      </Paso>

      <Paso n={3} titulo="Resultado" ayuda={r ? null : 'Aquí verás el recorrido del pago y lo que respondió el BCE.'} activo={!!r}>
        {r && (
          <div className="pila">
            <FlujoPago nodos={nodosDelResultado(r)} />
            <Aviso tono={conc[0]} titulo={conc[1]}>{conc[2]}</Aviso>
            <div className="rejilla r-3">
              <div className="tarjeta kpi"><span className="etq">Saldo antes</span><div className="valor">{dinero(r.saldoAntes)}</div></div>
              <div className="tarjeta kpi"><span className="etq">Saldo después</span><div className="valor">{dinero(r.saldoDespues)}</div></div>
              <div className="tarjeta kpi"><span className="etq">Dinero movido</span><div className="valor" style={{ color: r.diferencia > 1 ? 'var(--mal)' : 'var(--tinta)' }}>{dinero(r.diferencia)}</div></div>
            </div>
            <div className="tabla-envoltura">
              <table className="tabla">
                <thead><tr><th>Intento</th><th>Idempotency-Key</th><th className="num">Monto</th><th>HTTP</th><th>Respuesta del BCE</th></tr></thead>
                <tbody>
                  {r.intentos.map((i, n) => (
                    <tr key={n}>
                      <td>{n + 1}</td>
                      <td><code>{i.idempotencyKey ? `…${i.idempotencyKey.slice(-10)}` : '(ninguna)'}</code></td>
                      <td className="num">{dinero(i.monto)}</td>
                      <td><code>{i.http}</code></td>
                      <td>
                        {i.respuesta
                          ? <span className="fila"><EtiquetaEstado estado={i.respuesta.TxSts} />{i.repetida && <span className="etiqueta e-luz">Respuesta repetida</span>}</span>
                          : <span className="etiqueta e-mal">{i.error?.title}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {idTransf && (
              <div className="pila" style={{ gap: 10 }}>
                <div className="fila entre">
                  <h4>Mensaje ISO 20022</h4>
                  <div className="segmentado" role="tablist">
                    <button role="tab" aria-selected={xml?.mensaje === 'pacs008'} onClick={() => verXml.ejecutar(idTransf, 'pacs008')}>pacs.008 · orden</button>
                    <button role="tab" aria-selected={xml?.mensaje === 'pacs002'} onClick={() => verXml.ejecutar(idTransf, 'pacs002')}>pacs.002 · estado</button>
                  </div>
                </div>
                {xml ? <pre className="codigo-bloque">{xml.texto}</pre> : <p className="chico">Elige un mensaje para ver el XML que intercambian Faro y el BCE.</p>}
              </div>
            )}
          </div>
        )}
      </Paso>
    </Estacion>
  );
}
