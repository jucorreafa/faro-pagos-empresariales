import { useState } from 'react';
import { FileCode2 } from 'lucide-react';
import { Estacion, Problema, EtiquetaEstado, Cargando } from '../componentes/comunes.jsx';
import { api, dinero, URLS } from '../api.js';
import { useAccion } from '../hooks.js';

const ESCENARIOS = [
  { id: 'MISMA_LLAVE', titulo: 'Reintento con la misma llave', texto: 'El cliente no recibió respuesta y reenvía el MISMO pago con la MISMA Idempotency-Key.' },
  { id: 'SIN_LLAVE', titulo: 'Sin llave', texto: 'Se envía la orden sin Idempotency-Key.' },
  { id: 'LLAVE_REUTILIZADA', titulo: 'Misma llave, otro monto', texto: 'Se reutiliza una llave vieja para un pago distinto (error de programación).' },
  { id: 'LLAVES_DISTINTAS', titulo: 'Reintento con llave nueva', texto: 'El reintento genera una llave nueva cada vez. Mira qué pasa con el saldo.' },
];

const CONCLUSION = {
  MISMA_LLAVE: ['ok', 'El BCE reconoció la llave y devolvió la misma respuesta (Idempotent-Replayed). El dinero se movió una sola vez.'],
  SIN_LLAVE: ['ok', 'El BCE exige la llave: rechazó la orden con 400 antes de mover un centavo.'],
  LLAVE_REUTILIZADA: ['ok', 'El BCE detectó que la llave ya se usó con otro contenido y respondió 422. El segundo pago no ocurrió.'],
  LLAVES_DISTINTAS: ['mal', 'Doble cobro: con llaves distintas el BCE no puede saber que era el mismo pago. La llave debe generarse UNA vez por pago y guardarse.'],
};

export default function S4() {
  const [xml, setXml] = useState(null);
  const demo = useAccion(async (escenario) => {
    setXml(null);
    return (await api('faro', '/v1/demo/idempotencia', { method: 'POST', body: { escenario } })).datos;
  });
  const verXml = useAccion(async (id, mensaje) => {
    const r = await api('bce', `/v1/transferencias/${id}/iso20022?mensaje=${mensaje}`);
    setXml({ mensaje, texto: r.datos }); return true;
  });
  const r = demo.resultado;
  const idTransf = r?.intentos?.find((i) => i.respuesta?.transferenciaId)?.respuesta.transferenciaId;

  return (
    <Estacion
      semana={4}
      titulo="Contratos, idempotencia e ISO 20022"
      idea="Una API financiera es un contrato: qué se envía, qué se responde y qué pasa cuando algo falla. Si la red se corta a mitad de un pago, el cliente reintenta; la Idempotency-Key garantiza que reintentar no cobre dos veces."
      explicacion={<>
        <div>
          <h3>El contrato está publicado</h3>
          <p>Cada servicio publica su OpenAPI y se puede probar desde el navegador:</p>
          <div className="fila">
            <a className="boton chico claro" href={`${URLS.bce}/docs`} target="_blank" rel="noreferrer">BCE</a>
            <a className="boton chico claro" href={`${URLS.faro}/docs`} target="_blank" rel="noreferrer">Faro</a>
            <a className="boton chico claro" href={`${URLS.banco}/docs`} target="_blank" rel="noreferrer">Banco</a>
          </div>
        </div>
        <div>
          <h3>Errores con formato estándar</h3>
          <p style={{ margin: 0 }}>Todos los errores siguen RFC 9457 (<code>application/problem+json</code>): <code>title</code>, <code>status</code>, <code>detail</code>, un <code>codigo</code> estable y un <code>correlationId</code> para rastrear el caso.</p>
        </div>
      </>}
      codigo={[
        ['servicios/bce/src/servidor.js', 'POST /v1/transferencias: llave, caché, candado y UNIQUE'],
        ['servicios/bce/src/iso20022.js', 'pacs.008 y pacs.002 en XML'],
        ['servicios/bce/src/cache.js', 'Redis (Upstash) con plan B en memoria'],
      ]}
      proyecto="En tu API, ¿quién genera la Idempotency-Key, dónde se guarda y cuánto dura? Escribe un ejemplo de error de tu dominio en formato problem+json."
    >
      <h2>Envía el mismo pago de 1 dólar dos veces al BCE</h2>
      <div className="rejilla escenarios">
        {ESCENARIOS.map((e) => (
          <div key={e.id} className="hoja">
            <h3>{e.titulo}</h3>
            <p className="chico">{e.texto}</p>
            <button className="boton chico" disabled={demo.cargando} onClick={() => demo.ejecutar(e.id)}>Probar</button>
          </div>
        ))}
      </div>
      {demo.cargando && <div style={{ marginTop: 10 }}><Cargando texto="Enviando al BCE…" /></div>}
      <Problema error={demo.error} />

      {r && (
        <div className="hoja" style={{ marginTop: 14 }}>
          <div className={`aviso ${CONCLUSION[r.escenario][0]}`}>
            <b>Cuenta demo: {dinero(r.saldoAntes)} → {dinero(r.saldoDespues)} ({r.diferencia > 0 ? '+' : ''}{dinero(r.diferencia)})</b>
            <div>{CONCLUSION[r.escenario][1]}</div>
          </div>
          <div className="desliza" style={{ marginTop: 10 }}>
            <table className="tabla">
              <thead><tr><th>Intento</th><th>Idempotency-Key</th><th className="num">Monto</th><th>HTTP</th><th>Resultado</th></tr></thead>
              <tbody>
                {r.intentos.map((i, n) => (
                  <tr key={n}>
                    <td>{n + 1}</td>
                    <td><code>{i.idempotencyKey ? `…${i.idempotencyKey.slice(-10)}` : '(ninguna)'}</code></td>
                    <td className="num">{dinero(i.monto)}</td>
                    <td>{i.http}</td>
                    <td>
                      {i.respuesta ? <><EtiquetaEstado estado={i.respuesta.TxSts} />{i.repetida && <span className="etiqueta e-luz" style={{ marginLeft: 4 }}>Respuesta repetida</span>}</>
                        : <span className="chico">{i.error?.title}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {idTransf && (
            <div className="fila" style={{ marginTop: 12 }}>
              <span className="chico">Ver el mensaje ISO 20022:</span>
              <button className="boton chico claro" onClick={() => verXml.ejecutar(idTransf, 'pacs008')}><FileCode2 size={16} aria-hidden /> pacs.008 (orden)</button>
              <button className="boton chico claro" onClick={() => verXml.ejecutar(idTransf, 'pacs002')}><FileCode2 size={16} aria-hidden /> pacs.002 (estado)</button>
            </div>
          )}
          {xml && <pre className="xml" style={{ marginTop: 10 }} aria-label={`Mensaje ${xml.mensaje}`}>{xml.texto}</pre>}
        </div>
      )}
    </Estacion>
  );
}
