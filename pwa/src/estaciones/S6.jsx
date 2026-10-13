import { useState } from 'react';
import { Power, Timer, Ban, RotateCcw, Users, Zap } from 'lucide-react';
import { Estacion, Problema, EtiquetaEstado, Cargando } from '../componentes/comunes.jsx';
import { api, dinero, hora, llaveDocente } from '../api.js';
import { useAccion, useSondeo } from '../hooks.js';

function Circuito({ c }) {
  return (
    <div className="hoja">
      <div className="fila" style={{ justifyContent: 'space-between' }}>
        <h3>Circuito hacia {c.nombre}</h3>
        <span className="chico">{c.fallasSeguidas}/{c.umbralFallas} fallas seguidas</span>
      </div>
      <div className="circuito" style={{ marginTop: 10 }} aria-label={`Estado ${c.estado}`}>
        {['CERRADO', 'ABIERTO', 'SEMIABIERTO'].map((e) => (
          <div key={e} className={`${c.estado === e ? 'activo' : ''} ${e}`}>{e === 'SEMIABIERTO' ? 'Semiabierto' : e === 'CERRADO' ? 'Cerrado' : 'Abierto'}</div>
        ))}
      </div>
      <p className="chico" style={{ margin: '8px 0 4px' }}>
        Éxitos {c.contadores.exitos} · fallas {c.contadores.fallas} · cortadas sin llamar {c.contadores.rechazadasPorCircuito}
        {c.abiertoHasta && <> · prueba a las {hora(c.abiertoHasta)}</>}
      </p>
      {c.historial[0] && <p className="chico" style={{ margin: 0 }}>Último cambio: {c.historial[0].de} → {c.historial[0].a}: {c.historial[0].motivo}</p>}
    </div>
  );
}

function Compartimento({ b }) {
  return (
    <div className="hoja">
      <div className="fila" style={{ justifyContent: 'space-between' }}>
        <h3>{b.nombre}</h3>
        <span className="chico">{b.activos}/{b.maxConcurrentes} en curso · {b.enCola} en cola</span>
      </div>
      <div className="carril" style={{ marginTop: 8 }}>
        {b.trabajos.length === 0 && <span className="chico">Sin trabajos todavía</span>}
        {b.trabajos.map((t, i) => (
          <span key={i} className={`ficha ${t.estado}`} title={`espera ${t.esperaMs} ms`}>
            {t.etiqueta} {t.estado === 'TERMINADO' ? `${((t.esperaMs + (t.duracionMs || 0)) / 1000).toFixed(1)}s` : t.estado === 'EN_COLA' ? '…' : '▸'}
          </span>
        ))}
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
  const reiniciarCircuitos = useAccion(async () => api('faro', '/v1/admin/circuitos/reiniciar', { method: 'POST', docente: true }));

  const cb = caosBanco.datos || {};
  const cc = caosBce.datos || {};

  return (
    <Estacion
      semana={6}
      titulo="Saga, Circuit Breaker y Bulkhead"
      idea="En microservicios algo siempre está fallando. La pregunta no es cómo evitarlo, sino qué hace el sistema cuando pasa: no inventar resultados, no cobrar dos veces, no tumbar todo por una pieza enferma."
      explicacion={<>
        <div>
          <h3>Saga</h3>
          <p style={{ margin: 0 }}>Cada pago tiene dos pasos en dos sistemas distintos: débito en el banco y liquidación en el BCE. Si el BCE <b>rechaza</b>, Faro <b>compensa</b> devolviendo el dinero. Si no sabe qué pasó, deja el pago <b>en espera</b> y reintenta con la misma llave.</p>
        </div>
        <div>
          <h3>Circuit Breaker y Bulkhead</h3>
          <p style={{ margin: 0 }}>Tras 3 fallas seguidas el circuito se <b>abre</b> y deja de llamar al servicio caído durante 20 s. Los lotes y los pagos urgentes van por <b>compartimentos</b> distintos, con 2 pagos a la vez en cada uno.</p>
        </div>
      </>}
      codigo={[
        ['servicios/faro-api/src/aplicacion/saga.js', 'Pasos, espera y compensación'],
        ['servicios/faro-api/src/resiliencia/circuitBreaker.js', 'Cerrado → Abierto → Semiabierto'],
        ['servicios/faro-api/src/resiliencia/bulkhead.js', 'Compartimentos con cola'],
      ]}
      proyecto="Toma la operación más importante de tu proyecto: ¿cuáles son sus pasos, cuál es la compensación de cada uno y qué dependencia merece su propio circuito?"
    >
      <h2>Provoca una falla y mira cómo reacciona</h2>

      {docente ? (
        <div className="hoja">
          <h3>Controles del docente</h3>
          <div className="fila" style={{ marginTop: 8 }}>
            <button className={`boton chico ${cb.disponible === false ? 'peligro' : 'claro'}`} onClick={() => caos.ejecutar('banco', { disponible: cb.disponible === false })}>
              <Power size={16} aria-hidden /> Banco Andino {cb.disponible === false ? 'apagado' : 'encendido'}
            </button>
            <button className={`boton chico ${cb.latenciaMs ? 'peligro' : 'claro'}`} onClick={() => caos.ejecutar('banco', { latenciaMs: cb.latenciaMs ? 0 : 1500 })}>
              <Timer size={16} aria-hidden /> Banco lento {cb.latenciaMs ? `(${cb.latenciaMs / 1000} s)` : 'no'}
            </button>
            <button className={`boton chico ${cc.disponible === false ? 'peligro' : 'claro'}`} onClick={() => caos.ejecutar('bce', { disponible: cc.disponible === false })}>
              <Power size={16} aria-hidden /> BCE {cc.disponible === false ? 'apagado' : 'encendido'}
            </button>
            <button className={`boton chico ${cc.rechazarPagos ? 'peligro' : 'claro'}`} onClick={() => caos.ejecutar('bce', { rechazarPagos: !cc.rechazarPagos })}>
              <Ban size={16} aria-hidden /> BCE {cc.rechazarPagos ? 'rechaza todo' : 'acepta'}
            </button>
            <button className="boton chico claro" onClick={reiniciarCircuitos.ejecutar}><RotateCcw size={16} aria-hidden /> Cerrar circuitos</button>
          </div>
          <Problema error={caos.error} />
        </div>
      ) : (
        <p className="aviso">El docente controla las fallas desde su celular. Tú puedes lanzar pagos urgentes y ver qué pasa.</p>
      )}

      <div className="fila" style={{ margin: '14px 0' }}>
        <button className="boton luz" disabled={lanzar.cargando} onClick={() => lanzar.ejecutar('URGENTE')}><Zap size={18} aria-hidden /> Lanzar 3 pagos urgentes</button>
        {docente && <button className="boton" disabled={lanzar.cargando} onClick={() => lanzar.ejecutar('NOMINA')}><Users size={18} aria-hidden /> Pagar la nómina (9)</button>}
        <button className="boton claro" disabled={reintentar.cargando} onClick={reintentar.ejecutar}><RotateCcw size={18} aria-hidden /> Reintentar pagos en espera</button>
      </div>
      <Problema error={lanzar.error} />
      {reintentar.resultado && <p className="chico">Reintentando {reintentar.resultado.reintentando} pagos con su misma Idempotency-Key.</p>}

      {resiliencia.datos ? (
        <>
          <div className="rejilla">{resiliencia.datos.circuitos.map((c) => <Circuito key={c.nombre} c={c} />)}</div>
          <div className="rejilla" style={{ marginTop: 12 }}>{resiliencia.datos.bulkheads.map((b) => <Compartimento key={b.nombre} b={b} />)}</div>
        </>
      ) : <Cargando texto="Conectando con Faro…" />}

      {lote.datos && (
        <div className="hoja" style={{ marginTop: 14 }}>
          <div className="fila" style={{ justifyContent: 'space-between' }}>
            <h3>Bitácora de la Saga · lote {lote.datos.tipo.toLowerCase()}</h3>
            <EtiquetaEstado estado={lote.datos.estado} />
          </div>
          <div className="pila" style={{ marginTop: 10 }}>
            {lote.datos.pagos.map((p) => (
              <div key={p.id} style={{ borderTop: '1px solid var(--papel-2)', paddingTop: 8 }}>
                <div className="fila" style={{ justifyContent: 'space-between' }}>
                  <b>{p.beneficiario} · {dinero(p.monto)}</b>
                  <EtiquetaEstado estado={p.estado} />
                </div>
                <ul className="pasos">
                  {p.pasos.map((s, i) => (
                    <li key={i} className={s.resultado}><span><b>{s.paso.replaceAll('_', ' ').toLowerCase()}</b> · {s.detalle}</span></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </Estacion>
  );
}
