import { useState } from 'react';
import { ExternalLink, Check, X } from 'lucide-react';
import { Estacion, Paso, Opciones, FlujoPago } from '../componentes/comunes.jsx';
import { URLS } from '../api.js';
import { useSondeo } from '../hooks.js';

const PIEZAS = {
  faro: {
    nombre: 'Faro API', rol: 'Producto fintech (B2B)',
    bian: ['Payment Initiation', 'Payment Order', 'Customer Consent (tercero)'],
    hace: ['Recibe lotes de nómina y proveedores', 'Orquesta cada pago (Saga)', 'Lleva el registro para reportes'],
    noHace: ['Guardar el dinero de la empresa', 'Liquidar entre bancos'],
  },
  bce: {
    nombre: 'BCE Simulado', rol: 'Infraestructura de pagos',
    bian: ['Payment Execution', 'Clearing & Settlement', 'Correspondent Bank'],
    hace: ['Recibe órdenes ISO 20022 de los participantes', 'Evita pagos duplicados', 'Mueve fondos entre cuentas de liquidación'],
    noHace: ['Conocer el saldo de las personas'],
  },
  banco: {
    nombre: 'Banco Andino', rol: 'Core bancario',
    bian: ['Current Account', 'Savings Account', 'Party Reference Data', 'Customer Consent'],
    hace: ['Mantiene cuentas y movimientos', 'Debita y acredita el dinero real', 'Da acceso a terceros con consentimiento'],
    noHace: ['Saber qué es una nómina: solo ve débitos y créditos'],
  },
};

export default function S1() {
  const [sel, setSel] = useState('bce');
  const salud = useSondeo(sel, '/salud', 10000);
  const p = PIEZAS[sel];
  return (
    <Estacion
      semana={1}
      titulo="Arquitectura de referencia"
      idea="Antes de construir se dibuja el mapa: qué piezas hay, de qué se encarga cada una y qué NO le toca."
      conceptos={[
        ['Arquitectura de referencia', 'Un mapa común de responsabilidades que evita que dos piezas hagan lo mismo o que nadie haga algo crítico.'],
        ['BIAN', 'Estándar de la banca que da nombres a los dominios de servicio (Payment Execution, Current Account…) para que bancos y fintech hablen el mismo idioma.'],
      ]}
      codigo={[['db/01_esquema.sql', 'Tres esquemas: uno por pieza']]}
      proyecto="Dibuja tu mapa con 3 a 5 piezas. Para cada una: dominio BIAN, qué hace y qué no hace. ¿Dónde termina tu proyecto y dónde empieza el BCE?"
    >
      <Paso n={1} titulo="El recorrido de un sueldo" ayuda="Así viaja un pago de nómina por las tres piezas del sistema.">
        <FlujoPago nodos={[
          { id: 'faro', nombre: 'Faro', nota: 'ordena el pago', estado: sel === 'faro' ? 'ok' : '' },
          { id: 'bce', nombre: 'BCE', nota: 'liquida', estado: sel === 'bce' ? 'ok' : '' },
          { id: 'banco', nombre: 'Banco Andino', nota: 'debita y acredita', estado: sel === 'banco' ? 'ok' : '' },
        ]} />
      </Paso>
      <Paso n={2} titulo="Elige una pieza">
        <Opciones columnas={3} valor={sel} onCambio={setSel} etiqueta="Pieza del sistema" opciones={Object.entries(PIEZAS).map(([id, x]) => ({ id, titulo: x.nombre, texto: x.rol }))} />
      </Paso>
      <Paso n={3} titulo={p.nombre} ayuda={p.rol}>
        <div className="rejilla r-2">
          <div className="pila" style={{ gap: 8 }}>
            <h4>Hace</h4>
            {p.hace.map((t) => <span key={t} className="fila" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}><Check size={16} color="var(--ok)" style={{ marginTop: 3 }} aria-hidden /> {t}</span>)}
          </div>
          <div className="pila" style={{ gap: 8 }}>
            <h4>No hace</h4>
            {p.noHace.map((t) => <span key={t} className="fila" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}><X size={16} color="var(--mal)" style={{ marginTop: 3 }} aria-hidden /> {t}</span>)}
          </div>
        </div>
        <div className="separador" style={{ margin: '16px 0' }} />
        <div className="pila" style={{ gap: 8 }}>
          <h4>Dominios BIAN</h4>
          <div className="fila">{p.bian.map((b) => <span key={b} className="etiqueta">{b}</span>)}</div>
        </div>
        <div className="separador" style={{ margin: '16px 0' }} />
        <div className="fila entre">
          <span className="chico">
            {salud.datos ? <>En línea · contenedor <code>{salud.datos.contenedor.slice(-12)}</code></> : 'Consultando…'}
          </span>
          <a className="boton sec chico" href={`${URLS[sel]}/docs`} target="_blank" rel="noreferrer"><ExternalLink size={14} aria-hidden /> Ver su contrato</a>
        </div>
      </Paso>
    </Estacion>
  );
}
