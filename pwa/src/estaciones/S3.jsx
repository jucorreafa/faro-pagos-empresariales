import { useState } from 'react';
import { Building2, ShieldCheck } from 'lucide-react';
import { Estacion, Problema, EtiquetaEstado, Cargando } from '../componentes/comunes.jsx';
import { api, dinero, hora } from '../api.js';
import { useAccion } from '../hooks.js';

const PASOS = ['Faro pide permiso', 'La empresa aprueba en su banco', 'Faro consulta el saldo', 'La empresa revoca'];

export default function S3() {
  const [consent, setConsent] = useState(null);
  const [paso, setPaso] = useState(0);

  const pedir = useAccion(async () => {
    const r = await api('faro', '/v1/open-banking/consentimientos', { method: 'POST' });
    const det = await api('banco', `/open-banking/v1/consentimientos/${r.datos.id}`);
    setConsent(det.datos); setPaso(1); saldo.setResultado(null); return r.datos;
  });
  const decidir = useAccion(async (aprobar) => {
    const r = await api('banco', `/open-banking/v1/consentimientos/${consent.id}/autorizar`, { method: 'POST', body: { aprobar } });
    if (aprobar) {
      // [SIMULADO] el banco "redirige" a Faro con el token
      await api('faro', `/v1/open-banking/consentimientos/${consent.id}/token`, { method: 'POST', body: { tokenAcceso: r.datos.tokenAcceso } });
    }
    setConsent((c) => ({ ...c, estado: r.datos.estado })); setPaso(2); return r.datos;
  });
  const saldo = useAccion(async () => (await api('faro', '/v1/open-banking/saldo')).datos);
  const revocar = useAccion(async () => {
    await api('banco', `/open-banking/v1/consentimientos/${consent.id}`, { method: 'DELETE' });
    setConsent((c) => ({ ...c, estado: 'REVOCADO' })); setPaso(3); saldo.setResultado(null); return true;
  });

  return (
    <Estacion
      semana={3}
      titulo="Open Banking"
      idea="Un tercero (Faro) puede ver datos de un banco solo si el cliente lo autoriza: con un consentimiento que dice qué cuenta, qué datos y hasta cuándo. Y el cliente puede retirarlo cuando quiera."
      explicacion={<>
        <div>
          <h3>Lo que acaba de pasar</h3>
          <p style={{ margin: 0 }}>El banco nunca entrega la clave del cliente a Faro. Entrega un <b>token</b> limitado: solo la cuenta 2200000001, solo el saldo, por 90 días. Al revocar, ese token deja de servir de inmediato.</p>
        </div>
        <div>
          <h3>Simplificación</h3>
          <p style={{ margin: 0 }}>[SIMULADO] En la vida real la aprobación ocurre en la app del banco con OAuth 2.0 y el token viaja de servidor a servidor. Aquí se muestra en una sola pantalla para ver cada paso.</p>
        </div>
      </>}
      codigo={[
        ['servicios/banco-andino/src/servidor.js', 'Rutas /open-banking/v1/…'],
        ['servicios/faro-api/src/adaptadores/salida/bancoAndino.js', 'Faro como tercero autorizado'],
      ]}
      proyecto="¿Qué dato de un banco necesita tu proyecto (saldo, movimientos, ingresos)? Escribe el consentimiento: qué permisos, por cuántos días y qué pasa si el cliente lo revoca."
    >
      <h2>Faro quiere ver el saldo de Andes Café</h2>
      <ol className="fila" style={{ listStyle: 'none', padding: 0, margin: '0 0 14px', gap: 6 }}>
        {PASOS.map((p, i) => (
          <li key={p} className={`etiqueta ${i < paso ? 'e-ok' : i === paso ? 'e-luz' : ''}`}>{i + 1}. {p}</li>
        ))}
      </ol>

      <div className="rejilla">
        <div className="pila">
          <button className="boton" onClick={pedir.ejecutar} disabled={pedir.cargando}>
            <ShieldCheck size={18} aria-hidden /> {consent ? 'Pedir un permiso nuevo' : 'Pedir permiso al banco'}
          </button>
          {pedir.cargando && <Cargando />}
          <button className="boton claro" onClick={saldo.ejecutar} disabled={saldo.cargando}>Consultar saldo como Faro</button>
          {saldo.resultado && (
            <div className="aviso ok">
              Saldo visto por Faro: <b>{dinero(saldo.resultado.saldo)}</b>
              <div className="chico">cuenta {saldo.resultado.numero} · {hora(saldo.resultado.fecha)}</div>
            </div>
          )}
          <Problema error={saldo.error || pedir.error} />
        </div>

        {consent && (
          <div className="pantalla-banco" aria-label="Pantalla del Banco Andino">
            <header><Building2 size={20} aria-hidden /> Banco Andino · Autorizaciones</header>
            <div className="cuerpo">
              <p><b>{consent.tercero}</b> quiere acceder a tu cuenta <b>{consent.cuenta}</b>, a nombre de {consent.titular}.</p>
              <p className="chico">Permisos: {consent.permisos.join(', ')} · válido hasta {new Date(consent.expira).toLocaleDateString('es-EC')}</p>
              <p>Estado: <EtiquetaEstado estado={consent.estado} /></p>
              {consent.estado === 'PENDIENTE' && (
                <div className="fila">
                  <button className="boton" style={{ background: 'var(--banco)', borderColor: 'var(--banco)' }} onClick={() => decidir.ejecutar(true)} disabled={decidir.cargando}>Autorizar</button>
                  <button className="boton claro" onClick={() => decidir.ejecutar(false)} disabled={decidir.cargando}>Rechazar</button>
                </div>
              )}
              {consent.estado === 'AUTORIZADO' && (
                <button className="boton peligro" onClick={revocar.ejecutar} disabled={revocar.cargando}>Revocar el permiso</button>
              )}
              <Problema error={decidir.error || revocar.error} />
            </div>
          </div>
        )}
      </div>
    </Estacion>
  );
}
