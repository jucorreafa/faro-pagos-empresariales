import { useState } from 'react';
import { Zap, Users, RotateCcw } from 'lucide-react';
import { Estacion, Paso, Problema, EtiquetaEstado, Cargando, Aviso } from '../componentes/comunes.jsx';
import { api, dinero, hora, llaveDocente } from '../api.js';
import { useAccion, useSondeo } from '../hooks.js';

function Interruptor({ titulo, texto, activo, onClick, deshabilitado }) {
  return (
    <div className="interruptor">
      <div><b>{titulo}</b><span>{texto}</span></div>
      <button type="button" className="switch" role="switch" aria-checked={!!activo} aria-label={titulo} onClick={onClick} disabled={deshabilitado} />
    </div>
  );
}

function Circuito({ c }) {
  return (
    <div className="tarjeta tarjeta-cuerpo pila" style={{ gap: 10 }}>
      <div className="fila entre"><h4>Circuito hacia {c.nombre}</h4><span className="chico">{c.fallasSeguidas}/{c.umbralFallas} fallas</span></div>
      <div className="estados-circuito">
        {['CERRADO', 'ABIERTO', 'SEMIABIERTO'].map((e) => (
          <div key={e} className={`${c.estado === e ? 'activo' : ''} ${e}`}>{e === 'SEMIABIERTO' ? 'Semiabierto' : e === 'CERRADO' ? 'Cerrado' : 'Abierto'}</div>
        ))}
      </div>
      <span className="chico">
        {c.estado === 'ABIERTO' && c.abiertoHasta ? `No se llama al servicio hasta las ${hora(c.abiertoHasta)}` : c.historial[0] ? `Último cambio: ${c.historial[0].motivo}` : 'Sin fallas registradas'}
      </span>
    </div>
  );
}

function Compartimento({ b }) {
  return (
    <div className="tarjeta tarjeta-cuerpo pila" style={{ gap: 10 }}>
      <div className="fila entre"><h4>{b.nombre}</h4><span className="chico">{b.activos}/{b.maxConcurrentes} en curso · {b.enCola} en cola</span></div>
      <div className="carril">
        {b.trabajos.length === 0 && <span className="chico">Sin pagos todavía</span>}
        {b.trabajos.map((t, i) => <span key={i} className={`ficha-trabajo ${t.estado}`} title={`esperó ${t.esperaMs} ms`}>{t.etiqueta}</span>)}
      </div>
    </div>
  );
}

export default function S6() {
  const docente = !!llaveDocente();
  const [loteId, setLoteId] = useState(null);
  const resiliencia = useSondeo('faro', '/v1/resiliencia', 1200);
  const lote = useSondeo('faro', loteId ? `/v1/lotes/${loteId}` : null, 1500, !!loteId);
  const caosBanco = useSondeo('banco', '/v1/admin/caos', 2500);
  const caosBce = useSondeo('bce', '/v1/admin/caos', 2500);

  const lanzar = useAccion(async (tipo) => {
    const r = tipo === 'NOMINA'
      ? await api('faro', '/v1/lotes/nomina', { method: 'POST', docente: true })
      : await api('faro', '/v1/lotes', {
        method: 'POST', headers: { 'x-canal': 'PWA' },
        body: { tipo: 'URGENTE', pagos: [{ beneficiarioId: 'PRV-DEMO', monto: 1 }, { beneficiarioId: 'PRV-PAPELERIA', monto: 2 }, { beneficiarioId: 'PRV-REMESAS', monto: 3 }] },
      });
    setLoteId(r.datos.loteId); return r.datos;
  });
  const caos = useAccion(async (servicio, cambio) => {
    await api(servicio, '/v1/admin/caos', { method: 'PUT', body: cambio, docente: true });
    (servicio === 'banco' ? caosBanco : caosBce).recargar(); return true;
  });
  const reintentar = useAccion(async () => (await api('faro', '/v1/pagos/reintentar-pendientes', { method: 'POST' })).datos);
  const cerrar = useAccion(async () => api('faro', '/v1/admin/circuitos/reiniciar', { method: 'POST', docente: true }));
  const cb = caosBanco.datos || {};
  const cc = caosBce.datos || {};

  return (
    <Estacion
      semana={6}
      titulo="Saga, Circuit Breaker y Bulkhead"
      idea="En microservicios algo siempre está fallando. La pregunta es qué hace el sistema cuando pasa: no inventar resultados, no cobrar dos veces y no tumbar todo por una pieza enferma."
      conceptos={[
        ['Saga', 'Cada pago tiene dos pasos en dos sistemas: débito en el banco y liquidación en el BCE. Si el BCE rechaza, Faro compensa devolviendo el dinero. Si no sabe qué pasó, deja el pago en espera y reintenta con la misma llave.'],
        ['Circuit Breaker', 'Tras 3 fallas seguidas el circuito se abre y deja de llamar al servicio caído durante 20 s. Luego prueba con una sola llamada.'],
        ['Bulkhead', 'Lotes y pagos urgentes van por compartimentos separados (2 a la vez en cada uno). Si la nómina se atasca, lo urgente sigue saliendo.'],
      ]}
      codigo={[
        ['servicios/faro-api/src/aplicacion/saga.js', 'Pasos, espera y compensación'],
        ['servicios/faro-api/src/resiliencia/circuitBreaker.js', 'Cerrado → Abierto → Semiabierto'],
        ['servicios/faro-api/src/resiliencia/bulkhead.js', 'Compartimentos con cola'],
      ]}
      proyecto="Toma la operación más importante de tu proyecto: ¿cuáles son sus pasos, cuál es la compensación de cada uno y qué dependencia merece su propio circuito?"
    >
      <Paso n={1} titulo="Provoca una falla" ayuda={docente ? 'Activa una falla y luego lanza pagos.' : 'El docente controla las fallas desde su dispositivo.'}>
        {docente ? (
          <div>
            <Interruptor titulo="Apagar el Banco Andino" texto="Responde 503 a todo: el circuito se abrirá." activo={cb.disponible === false} onClick={() => caos.ejecutar('banco', { disponible: cb.disponible === false })} />
            <Interruptor titulo="Banco lento (1,5 s)" texto="Cada llamada tarda más: mira las colas del Bulkhead." activo={!!cb.latenciaMs} onClick={() => caos.ejecutar('banco', { latenciaMs: cb.latenciaMs ? 0 : 1500 })} />
            <Interruptor titulo="Apagar el BCE" texto="El débito ocurre, pero la liquidación no: pagos en espera." activo={cc.disponible === false} onClick={() => caos.ejecutar('bce', { disponible: cc.disponible === false })} />
            <Interruptor titulo="BCE rechaza todo" texto="Respuesta definitiva RJCT: la Saga compensa." activo={!!cc.rechazarPagos} onClick={() => caos.ejecutar('bce', { rechazarPagos: !cc.rechazarPagos })} />
            <Problema error={caos.error} />
          </div>
        ) : <Aviso>Para activar fallas, entra a <a href="#/docente">Modo docente</a>.</Aviso>}
      </Paso>

      <Paso n={2} titulo="Lanza pagos">
        <div className="accion">
          <button className="boton grande" disabled={lanzar.cargando} onClick={() => lanzar.ejecutar('URGENTE')}><Zap size={18} aria-hidden /> 3 pagos urgentes</button>
          {docente && <button className="boton grande sec" disabled={lanzar.cargando} onClick={() => lanzar.ejecutar('NOMINA')}><Users size={18} aria-hidden /> Nómina completa (9)</button>}
          <button className="boton sec" disabled={reintentar.cargando} onClick={reintentar.ejecutar}><RotateCcw size={16} aria-hidden /> Reintentar en espera</button>
          {docente && <button className="boton sec" onClick={cerrar.ejecutar}>Cerrar circuitos</button>}
        </div>
        {reintentar.resultado && <p className="chico" style={{ marginTop: 10 }}>Reintentando {reintentar.resultado.reintentando} pagos con su misma Idempotency-Key.</p>}
        {lanzar.error && <div style={{ marginTop: 12 }}><Problema error={lanzar.error} /></div>}
      </Paso>

      <Paso n={3} titulo="Observa la reacción" ayuda="Se actualiza solo cada segundo.">
        {resiliencia.datos ? (
          <div className="pila">
            <div className="rejilla r-2">{resiliencia.datos.circuitos.map((c) => <Circuito key={c.nombre} c={c} />)}</div>
            <div className="rejilla r-2">{resiliencia.datos.bulkheads.map((b) => <Compartimento key={b.nombre} b={b} />)}</div>
            {lote.datos && (
              <div className="tarjeta">
                <div className="tarjeta-cab">
                  <div><h4>Bitácora de la Saga</h4><p>Lote {lote.datos.tipo.toLowerCase()} · {lote.datos.pagos.length} pagos</p></div>
                  <EtiquetaEstado estado={lote.datos.estado} />
                </div>
                <div className="tarjeta-cuerpo pila" style={{ gap: 14 }}>
                  {lote.datos.pagos.map((p) => (
                    <div key={p.id} className="pila" style={{ gap: 6 }}>
                      <div className="fila entre"><b>{p.beneficiario} · {dinero(p.monto)}</b><EtiquetaEstado estado={p.estado} /></div>
                      <ul className="bitacora">
                        {p.pasos.map((s, i) => <li key={i} className={s.resultado}><span><b>{s.paso.replaceAll('_', ' ').toLowerCase()}</b> · {s.detalle}</span></li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : <Cargando texto="Conectando con Faro…" />}
      </Paso>
    </Estacion>
  );
}
