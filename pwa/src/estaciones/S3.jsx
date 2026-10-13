import { useState } from 'react';
import { Building2, ShieldCheck, Eye, Ban } from 'lucide-react';
import { Estacion, Paso, Problema, EtiquetaEstado, Cargando, Aviso } from '../componentes/comunes.jsx';
import { api, dinero, hora } from '../api.js';
import { useAccion } from '../hooks.js';

export default function S3() {
  const [consent, setConsent] = useState(null);

  const pedir = useAccion(async () => {
    const r = await api('faro', '/v1/open-banking/consentimientos', { method: 'POST' });
    const det = await api('banco', `/open-banking/v1/consentimientos/${r.datos.id}`);
    setConsent(det.datos); saldo.setResultado(null); return r.datos;
  });
  const decidir = useAccion(async (aprobar) => {
    const r = await api('banco', `/open-banking/v1/consentimientos/${consent.id}/autorizar`, { method: 'POST', body: { aprobar } });
    if (aprobar) await api('faro', `/v1/open-banking/consentimientos/${consent.id}/token`, { method: 'POST', body: { tokenAcceso: r.datos.tokenAcceso } });
    setConsent((c) => ({ ...c, estado: r.datos.estado })); return r.datos;
  });
  const saldo = useAccion(async () => (await api('faro', '/v1/open-banking/saldo')).datos);
  const revocar = useAccion(async () => {
    await api('banco', `/open-banking/v1/consentimientos/${consent.id}`, { method: 'DELETE' });
    setConsent((c) => ({ ...c, estado: 'REVOCADO' })); saldo.setResultado(null); return true;
  });

  const estado = consent?.estado;
  return (
    <Estacion
      semana={3}
      titulo="Open Banking"
      idea="Un tercero (Faro) solo ve datos del banco si el cliente lo autoriza: qué cuenta, qué datos y hasta cuándo. Y el cliente puede retirar el permiso cuando quiera."
      conceptos={[
        ['Consentimiento', 'Registro en el banco que dice: este tercero puede ver esta cuenta, estos datos, hasta esta fecha.'],
        ['Token de acceso', 'El banco nunca entrega la clave del cliente. Entrega un token limitado que deja de servir al revocarlo.'],
        ['Simplificación', '[SIMULADO] En la vida real la aprobación ocurre en la app del banco con OAuth 2.0. Aquí se muestra en una pantalla para ver cada paso.'],
      ]}
      codigo={[
        ['servicios/banco-andino/src/servidor.js', 'Rutas /open-banking/v1/…'],
        ['servicios/faro-api/src/adaptadores/salida/bancoAndino.js', 'Faro como tercero autorizado'],
      ]}
      proyecto="¿Qué dato de un banco necesita tu proyecto? Escribe el consentimiento: permisos, días de vigencia y qué pasa si el cliente lo revoca."
    >
      <Paso n={1} titulo="Faro pide permiso al banco" ayuda="Quiere ver el saldo de la cuenta de Andes Café.">
        <div className="accion">
          <button className="boton grande" onClick={pedir.ejecutar} disabled={pedir.cargando}><ShieldCheck size={18} aria-hidden /> {consent ? 'Pedir un permiso nuevo' : 'Pedir permiso'}</button>
          {pedir.cargando && <Cargando />}
          {estado && <EtiquetaEstado estado={estado} />}
        </div>
        {pedir.error && <div style={{ marginTop: 12 }}><Problema error={pedir.error} /></div>}
      </Paso>

      <Paso n={2} titulo="La empresa decide en su banco" ayuda="Pantalla del Banco Andino (identidad propia a propósito)." activo={!!consent}>
        {consent ? (
          <div className="pantalla-banco">
            <header><Building2 size={18} aria-hidden /> Banco Andino · Autorizaciones</header>
            <div className="cuerpo">
              <p><b>{consent.tercero}</b> quiere acceder a tu cuenta <b>{consent.cuenta}</b>, a nombre de {consent.titular}.</p>
              <div className="fila"><span className="etiqueta">Permiso: {consent.permisos.join(', ')}</span><span className="etiqueta">Hasta {new Date(consent.expira).toLocaleDateString('es-EC')}</span></div>
              {estado === 'PENDIENTE' && (
                <div className="fila">
                  <button className="boton" style={{ background: 'var(--banco)', borderColor: 'var(--banco)' }} onClick={() => decidir.ejecutar(true)} disabled={decidir.cargando}>Autorizar</button>
                  <button className="boton sec" onClick={() => decidir.ejecutar(false)} disabled={decidir.cargando}>Rechazar</button>
                </div>
              )}
              {estado === 'AUTORIZADO' && <button className="boton peligro" onClick={revocar.ejecutar} disabled={revocar.cargando}><Ban size={16} aria-hidden /> Revocar el permiso</button>}
              {(estado === 'REVOCADO' || estado === 'RECHAZADO') && <p className="chico">Faro ya no tiene acceso. Pide un permiso nuevo para repetir.</p>}
              <Problema error={decidir.error || revocar.error} />
            </div>
          </div>
        ) : <p className="chico">Primero pide el permiso.</p>}
      </Paso>

      <Paso n={3} titulo="Faro consulta el saldo" ayuda="Pruébalo antes de autorizar, después de autorizar y después de revocar." activo={!!consent}>
        <div className="accion">
          <button className="boton sec" onClick={saldo.ejecutar} disabled={saldo.cargando}><Eye size={16} aria-hidden /> Consultar saldo como Faro</button>
          {saldo.cargando && <Cargando texto="Consultando…" />}
        </div>
        <div style={{ marginTop: 12 }}>
          {saldo.resultado && <Aviso tono="ok" titulo={`Saldo visto por Faro: ${dinero(saldo.resultado.saldo)}`}>Cuenta {saldo.resultado.numero} · consultado a las {hora(saldo.resultado.fecha)}</Aviso>}
          <Problema error={saldo.error} />
        </div>
      </Paso>
    </Estacion>
  );
}
