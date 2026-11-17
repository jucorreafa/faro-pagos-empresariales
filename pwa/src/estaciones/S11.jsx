import { useState } from 'react';
import { ShieldQuestion, KeyRound, ShieldX, Calculator, Loader2 } from 'lucide-react';
import { Estacion, Paso, Aviso } from '../componentes/comunes.jsx';
import { api } from '../api.js';

/** Llama al BCE y devuelve siempre { status, cuerpo }, también cuando hay error (para mostrarlo). */
async function probar(ruta, { method = 'GET', headers = {}, body } = {}) {
  try {
    const r = await api('bce', ruta, { method, headers, body, timeoutMs: 90000 });
    return { status: r.status, cuerpo: r.datos };
  } catch (e) {
    return { status: e.status || 0, cuerpo: e.cuerpo || { detail: e.message } };
  }
}

function useProbar(fn) {
  const [r, setR] = useState(null);
  const [cargando, setCargando] = useState(false);
  return {
    r, cargando,
    ejecutar: async () => { setCargando(true); setR(await fn()); setCargando(false); },
  };
}

function Respuesta({ r }) {
  if (!r) return null;
  const mal = r.status >= 400 || r.status === 0;
  const c = r.cuerpo || {};
  return (
    <Aviso tono={mal ? 'mal' : 'ok'} titulo={`HTTP ${r.status || 'sin conexión'}${c.codigo ? ` · ${c.codigo}` : ''}`}>
      {c.title ? <>{c.title}. </> : null}{c.detail || c.mensaje || ''}
    </Aviso>
  );
}

const BtnProbar = ({ p, Ico, children }) => (
  <button className="boton" onClick={p.ejecutar} disabled={p.cargando}>
    {p.cargando ? <Loader2 size={16} className="gira" aria-hidden /> : <Ico size={16} aria-hidden />} {children}
  </button>
);

const fmt = (n, d = 2) => n.toLocaleString('es-EC', { minimumFractionDigits: d, maximumFractionDigits: d });

function Calculadoras() {
  const [vidaLarga, setVidaLarga] = useState(480);
  const [vidaCorta, setVidaCorta] = useState(20);
  const [veces, setVeces] = useState(3);
  const [perdida, setPerdida] = useState(1000);
  const [costo, setCosto] = useState(500);
  const [total, setTotal] = useState(1000);
  const [r401, setR401] = useState(60);
  const [r5xx, setR5xx] = useState(20);
  const factor = vidaCorta > 0 ? vidaLarga / vidaCorta : 0;
  const neta = veces * perdida - costo;
  const validas = Math.max(total - r401, 0);
  const sli = validas > 0 ? ((validas - r5xx) / validas) * 100 : 0;
  const Num = ({ v, set, t }) => (
    <label className="chico" style={{ display: 'grid', gap: 2 }}>{t}
      <input type="number" min="0" value={v} onChange={(e) => set(Number(e.target.value) || 0)} style={{ width: '100%' }} />
    </label>
  );
  return (
    <div className="pila" style={{ gap: 12 }}>
      <div className="tarjeta"><div className="tarjeta-cab"><h4>Ventana de un token filtrado</h4></div>
        <div className="tarjeta-cuerpo pila" style={{ gap: 8 }}>
          <div className="rejilla r-2"><Num v={vidaLarga} set={setVidaLarga} t="Vida larga (minutos)" /><Num v={vidaCorta} set={setVidaCorta} t="Vida corta (minutos)" /></div>
          <p className="chico" style={{ margin: 0 }}>La ventana baja <b>{fmt(factor, 1)} veces</b>. El costo: más renovaciones y más dependencia del emisor.</p>
        </div></div>
      <div className="tarjeta"><div className="tarjeta-cab"><h4>Pérdida evitada neta</h4></div>
        <div className="tarjeta-cuerpo pila" style={{ gap: 8 }}>
          <div className="rejilla r-3"><Num v={veces} set={setVeces} t="Veces por año" /><Num v={perdida} set={setPerdida} t="Pérdida por vez (USD)" /><Num v={costo} set={setCosto} t="Costo del control (USD/año)" /></div>
          <p className="chico" style={{ margin: 0 }}>Riesgo anual {fmt(veces * perdida, 0)} − costo {fmt(costo, 0)} = <b>{fmt(neta, 0)} USD</b> de pérdida evitada neta.</p>
        </div></div>
      <div className="tarjeta"><div className="tarjeta-cab"><h4>SLI cuando aparecen los 401 (ADR-07)</h4></div>
        <div className="tarjeta-cuerpo pila" style={{ gap: 8 }}>
          <div className="rejilla r-3"><Num v={total} set={setTotal} t="Peticiones totales" /><Num v={r401} set={setR401} t="Rechazos 401" /><Num v={r5xx} set={setR5xx} t="Errores 5xx" /></div>
          <p className="chico" style={{ margin: 0 }}>Válidas {validas} · buenas {Math.max(validas - r5xx, 0)} · SLI = <b>{fmt(sli)} %</b>. Los 401 por token vencido salen del denominador; los 5xx son las fallas.</p>
        </div></div>
    </div>
  );
}

export default function S11() {
  const [llave, setLlave] = useState('');
  const sinLlave = useProbar(() => probar('/v1/participantes/yo'));
  const llaveFalsa = useProbar(() => probar('/v1/participantes/yo', { headers: { 'x-api-key': 'llave-que-no-existe-0000' } }));
  const otroAgente = useProbar(async () => {
    const yo = await probar('/v1/participantes/yo', { headers: { 'x-api-key': llave } });
    if (yo.status !== 200) return yo;
    const dueno = yo.cuerpo.codigo;
    const otro = dueno === 'BILLETERA' ? 'REMESAS' : 'BILLETERA';
    return probar('/v1/transferencias', {
      method: 'POST',
      headers: { 'x-api-key': llave, 'idempotency-key': `s11-agente-${Date.now()}` },
      body: {
        GrpHdr: { MsgId: `S11-${Date.now()}`, CreDtTm: new Date().toISOString(), NbOfTxs: 1 },
        CdtTrfTxInf: {
          PmtId: { EndToEndId: `S11-E2E-${Date.now()}` },
          IntrBkSttlmAmt: { Ccy: 'USD', Amt: 1 },
          DbtrAgt: { Id: otro }, Dbtr: { Nm: 'Prueba S11' }, DbtrAcct: { Id: `${otro}-0001` },
          CdtrAgt: { Id: 'BAS' }, Cdtr: { Nm: 'Cuenta demo de clase' }, CdtrAcct: { Id: '2200009999' },
        },
      },
    });
  });
  return (
    <Estacion
      semana={11}
      titulo="Seguridad: ¿quién llama y qué puede hacer?"
      idea="Hasta la semana 9 el BCE aguantaba y se medía, pero suponía que quien llama es quien dice. Aquí dejamos de suponerlo: provoca los rechazos reales del BCE y mira qué amenaza de STRIDE atiende cada uno."
      conceptos={[
        ['STRIDE', 'Seis familias de amenaza: suplantación, alteración, repudio, divulgación, negación de servicio y elevación de privilegios. Un vocabulario común para revisar un diseño.'],
        ['Autenticar no es autorizar', '401 dice “no sé quién eres”. 403 dice “sé quién eres, pero esto no te toca”. El BCE hace las dos cosas.'],
        ['Zero trust', 'Ninguna llamada se acepta por venir “de adentro”: se verifica identidad y permiso en cada una. La regla de red del repositorio es solo una pieza (segmentación).'],
        ['Hoy y mañana', 'Hoy solo Faro API llama al BCE. Los cuatro equipos tienen participante y llave, pero aún no se conectan: es una propuesta. Conectarlos es justo el tema del ADR-08.'],
        ['Propuesta, no construido', 'OAuth 2.0 con client credentials y token de 15 minutos es la propuesta del ADR-08. Hoy el BCE usa una llave fija X-Api-Key.'],
      ]}
      codigo={[
        ['servicios/bce/src/servidor.js', 'autenticar(): 401 SIN_API_KEY y API_KEY_INVALIDA; la llave se guarda como hash sha256'],
        ['servicios/bce/src/servidor.js', 'POST /v1/transferencias: 403 AGENTE_INCORRECTO (DbtrAgt debe ser el dueño de la llave)'],
        ['k8s/20-red.yaml', 'NetworkPolicy: el Banco Andino solo acepta al BCE y a Faro API (segmentación)'],
      ]}
      proyecto="ADR-08: elige un flujo de tu proyecto que mueva dinero y cruce una frontera de confianza. Nombra la letra de STRIDE, pon una cifra con su supuesto y escribe qué empeora con tu control."
    >
      <Paso n={1} titulo="Sin llave: ¿quién eres?" ayuda="Llama al BCE sin ninguna credencial. Amenaza que atiende: S (suplantación).">
        <BtnProbar p={sinLlave} Ico={ShieldQuestion}>Llamar sin llave</BtnProbar>
        <Respuesta r={sinLlave.r} />
      </Paso>
      <Paso n={2} titulo="Con una llave inventada" ayuda="El BCE guarda solo el hash de cada llave y busca el de la que le envías. Si no coincide con un participante activo, rechaza.">
        <BtnProbar p={llaveFalsa} Ico={KeyRound}>Llamar con llave falsa</BtnProbar>
        <Respuesta r={llaveFalsa.r} />
      </Paso>
      <Paso n={3} titulo="Llave válida, orden de otro" ayuda="Una llave válida no basta: la orden debe ser del dueño de la llave. Pega la llave de cualquier participante del BCE (sirve la de FARO; solo se usa en esta pantalla, no se guarda). La orden dice ser de otro participante. Amenaza que atiende: E (elevación de privilegios).">
        <input type="password" autoComplete="off" placeholder="Llave X-Api-Key de un participante (ej. FARO)" value={llave} onChange={(e) => setLlave(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
        <button className="boton" onClick={otroAgente.ejecutar} disabled={otroAgente.cargando || !llave}>
          {otroAgente.cargando ? <Loader2 size={16} className="gira" aria-hidden /> : <ShieldX size={16} aria-hidden />} Enviar una orden a nombre de otro participante
        </button>
        <Respuesta r={otroAgente.r} />
        <Aviso>La orden se rechaza antes de mover dinero: es de 1 USD y nunca llega a liquidarse.</Aviso>
      </Paso>
      <Paso n={4} titulo="Las cuentas de la lectura" ayuda="Cambia los números y compara con tus cálculos a mano.">
        <Calculadoras />
        <p className="chico"><Calculator size={14} aria-hidden /> Valores de ejemplo simulados.</p>
      </Paso>
    </Estacion>
  );
}
