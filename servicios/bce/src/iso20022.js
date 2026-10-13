// ---------------------------------------------------------------------------
// ISO 20022 (S4). El BCE recibe un pacs.008 SIMPLIFICADO en JSON y responde con
// un pacs.002 (estado). Este módulo genera la versión XML para que el alumno vea
// cómo luce el mensaje "de verdad". [SIMULADO]: estructura reducida con fines
// didácticos; no valida contra el XSD oficial.
// ---------------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

export const MOTIVOS = {
  AM04: 'Fondos insuficientes en la cuenta de liquidación del participante ordenante',
  AC01: 'Número de cuenta del beneficiario incorrecto o inexistente',
  AC04: 'Cuenta cerrada',
  AB05: 'El banco del beneficiario no respondió a tiempo',
  RC01: 'Participante (agente) beneficiario no registrado en el BCE',
  AG01: 'Operación no permitida para este participante',
  DU01: 'Mensaje duplicado',
  MS03: 'Rechazo simulado por el docente (demostración de compensación)',
};

export function pacs008Xml(t) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- [SIMULADO] pacs.008 simplificado · BCE Faro (UIDE) -->
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>${esc(t.msg_id)}</MsgId>
      <CreDtTm>${new Date(t.creado).toISOString()}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf><SttlmMtd>CLRG</SttlmMtd></SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <EndToEndId>${esc(t.end_to_end_id)}</EndToEndId>
        <TxId>${esc(t.id)}</TxId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="${esc(t.moneda)}">${Number(t.monto).toFixed(2)}</IntrBkSttlmAmt>
      <Dbtr><Nm>${esc(t.deudor_nombre)}</Nm></Dbtr>
      <DbtrAcct><Id><Othr><Id>${esc(t.deudor_cuenta)}</Id></Othr></Id></DbtrAcct>
      <DbtrAgt><FinInstnId><Othr><Id>${esc(t.participante_origen)}</Id></Othr></FinInstnId></DbtrAgt>
      <CdtrAgt><FinInstnId><Othr><Id>${esc(t.participante_destino)}</Id></Othr></FinInstnId></CdtrAgt>
      <Cdtr><Nm>${esc(t.acreedor_nombre)}</Nm></Cdtr>
      <CdtrAcct><Id><Othr><Id>${esc(t.acreedor_cuenta)}</Id></Othr></Id></CdtrAcct>
      <RmtInf><Ustrd>${esc(t.concepto)}</Ustrd></RmtInf>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`;
}

export function pacs002Xml(t) {
  const motivo = t.motivo_codigo
    ? `\n        <StsRsnInf><Rsn><Cd>${esc(t.motivo_codigo)}</Cd></Rsn><AddtlInf>${esc(t.motivo_texto)}</AddtlInf></StsRsnInf>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- [SIMULADO] pacs.002 simplificado · respuesta del BCE Faro -->
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.002.001.10">
  <FIToFIPmtStsRpt>
    <GrpHdr>
      <MsgId>BCE-${esc(String(t.id).slice(0, 8))}</MsgId>
      <CreDtTm>${new Date(t.liquidado || t.creado).toISOString()}</CreDtTm>
    </GrpHdr>
    <OrgnlGrpInfAndSts>
      <OrgnlMsgId>${esc(t.msg_id)}</OrgnlMsgId>
      <OrgnlMsgNmId>pacs.008.001.08</OrgnlMsgNmId>
    </OrgnlGrpInfAndSts>
    <TxInfAndSts>
      <OrgnlEndToEndId>${esc(t.end_to_end_id)}</OrgnlEndToEndId>
      <TxSts>${esc(t.estado)}</TxSts>${motivo}
    </TxInfAndSts>
  </FIToFIPmtStsRpt>
</Document>`;
}
