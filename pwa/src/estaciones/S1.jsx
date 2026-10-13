import { useState } from 'react';
import { Landmark, Building2, Waypoints } from 'lucide-react';
import { Estacion } from '../componentes/comunes.jsx';
import { URLS } from '../api.js';

const NODOS = [
  {
    id: 'faro', icono: Waypoints, nombre: 'Faro API', rol: 'Producto fintech (B2B)',
    bian: ['Payment Initiation', 'Payment Order', 'Customer Consent (como tercero)'],
    hace: 'Recibe lotes de nómina y proveedores, orquesta cada pago y lleva el registro para reportes.',
    noHace: 'No guarda el dinero ni liquida entre bancos.',
  },
  {
    id: 'bce', icono: Landmark, nombre: 'BCE Simulado', rol: 'Infraestructura de pagos',
    bian: ['Payment Execution', 'Clearing & Settlement', 'Correspondent Bank'],
    hace: 'Recibe órdenes ISO 20022 de los participantes, evita duplicados y mueve fondos entre cuentas de liquidación.',
    noHace: 'No conoce el saldo de las personas: eso es del banco.',
  },
  {
    id: 'banco', icono: Building2, nombre: 'Banco Andino', rol: 'Core bancario',
    bian: ['Current Account', 'Savings Account', 'Party Reference Data', 'Customer Consent'],
    hace: 'Mantiene cuentas y movimientos. Es donde, al final, el dinero se debita o se acredita.',
    noHace: 'No sabe qué es una nómina: solo ve débitos y créditos.',
  },
];

export default function S1() {
  const [sel, setSel] = useState('bce');
  const n = NODOS.find((x) => x.id === sel);
  return (
    <Estacion
      semana={1}
      titulo="Arquitectura de referencia"
      idea="Antes de construir, se dibuja el mapa: qué piezas hay, de qué se encarga cada una y qué NO le toca. BIAN da nombres estándar a esas responsabilidades para que bancos y fintech hablen el mismo idioma."
      explicacion={<>
        <div>
          <h3>El recorrido de un sueldo</h3>
          <p style={{ margin: 0 }}>Andes Café pide a <b>Faro</b> pagar la nómina → Faro pide al <b>Banco Andino</b> debitar a la empresa → Faro envía la orden al <b>BCE</b> → el BCE liquida y pide al Banco Andino acreditar al empleado.</p>
        </div>
      </>}
      codigo={[['db/01_esquema.sql', 'Tres esquemas: uno por servicio']]}
      proyecto="Dibuja tu mapa con 3 a 5 piezas. Para cada una escribe su dominio BIAN, qué hace y qué no hace. ¿Dónde termina tu proyecto y dónde empieza el BCE?"
    >
      <h2>Toca cada pieza del sistema</h2>
      <div className="mapa" role="group" aria-label="Piezas del sistema">
        {NODOS.map((x) => (
          <button key={x.id} className="nodo" aria-pressed={sel === x.id} onClick={() => setSel(x.id)}>
            <h3><x.icono size={20} aria-hidden /> {x.nombre}</h3>
            <span className="chico">{x.rol}</span>
          </button>
        ))}
      </div>
      <div className="hoja" style={{ marginTop: 14 }}>
        <h3>{n.nombre}</h3>
        <p><b>Hace:</b> {n.hace}</p>
        <p><b>No hace:</b> {n.noHace}</p>
        <p style={{ marginBottom: 6 }}><b>Dominios BIAN:</b></p>
        <div className="fila">{n.bian.map((b) => <span key={b} className="etiqueta">{b}</span>)}</div>
        <p className="chico" style={{ marginTop: 12, marginBottom: 0 }}>
          Vive en: <a href={`${URLS[sel]}/docs`} target="_blank" rel="noreferrer">{URLS[sel]}</a>
        </p>
      </div>
    </Estacion>
  );
}
