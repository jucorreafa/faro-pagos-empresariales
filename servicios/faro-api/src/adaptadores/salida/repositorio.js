// ADAPTADOR DE SALIDA → PostgreSQL (Supabase), esquema "faro" (puerto "Repositorio").
export function crearRepositorio(pool) {
  const q = (sql, p) => pool.query(sql, p);

  return {
    async empresa() {
      const { rows: [e] } = await q(`select * from faro.empresas limit 1`);
      return e;
    },
    async beneficiarios(empresaId) {
      const { rows } = await q(`select * from faro.beneficiarios where empresa_id=$1 order by tipo, nombre`, [empresaId]);
      return rows;
    },
    async loteConLlave(llave) {
      if (!llave) return null;
      const { rows: [l] } = await q(`select id from faro.lotes where idempotency_key=$1`, [llave]);
      return l || null;
    },
    async crearLote({ empresaId, tipo, canal, descripcion, idempotencyKey, pagos }) {
      const cli = await pool.connect();
      try {
        await cli.query('begin');
        const { rows: [l] } = await cli.query(
          `insert into faro.lotes (empresa_id,tipo,canal,descripcion,idempotency_key,estado)
           values ($1,$2,$3,$4,$5,'PROCESANDO') returning *`,
          [empresaId, tipo, canal, descripcion || null, idempotencyKey || null]);
        for (const p of pagos) {
          await cli.query(`insert into faro.pagos (lote_id,beneficiario_id,monto) values ($1,$2,$3)`, [l.id, p.beneficiarioId, p.monto]);
        }
        await cli.query('commit');
        return l;
      } catch (e) {
        await cli.query('rollback');
        throw e;
      } finally {
        cli.release();
      }
    },
    async pagosDelLote(loteId) {
      const { rows } = await q(`
        select p.*, b.nombre as beneficiario, b.banco, b.cuenta, b.tipo as tipo_beneficiario, l.tipo as tipo_lote, l.creado as lote_creado
          from faro.pagos p join faro.beneficiarios b on b.id=p.beneficiario_id join faro.lotes l on l.id=p.lote_id
         where p.lote_id=$1 order by b.nombre`, [loteId]);
      return rows;
    },
    async pago(id) {
      const { rows: [p] } = await q(`
        select p.*, b.nombre as beneficiario, b.banco, b.cuenta, l.tipo as tipo_lote, l.creado as lote_creado
          from faro.pagos p join faro.beneficiarios b on b.id=p.beneficiario_id join faro.lotes l on l.id=p.lote_id
         where p.id=$1`, [id]);
      return p;
    },
    async actualizarPago(id, cambios) {
      const campos = Object.keys(cambios);
      const sets = campos.map((c, i) => `${c}=$${i + 2}`).join(', ');
      await q(`update faro.pagos set ${sets}, actualizado=now() where id=$1`, [id, ...campos.map((c) => cambios[c])]);
    },
    async pasoSaga(pagoId, paso, resultado, detalle) {
      await q(`insert into faro.saga_pasos (pago_id,paso,resultado,detalle) values ($1,$2,$3,$4)`, [pagoId, paso, resultado, detalle || null]);
    },
    async actualizarEstadoLote(loteId, estado) {
      await q(`update faro.lotes set estado=$2, terminado = case when $2 in ('COMPLETADO','PARCIAL','FALLIDO') then now() else null end where id=$1`, [loteId, estado]);
    },
    async lote(id) {
      const { rows: [l] } = await q(`select * from faro.lotes where id::text=$1`, [id]);
      return l;
    },
    async pasosDelLote(loteId) {
      const { rows } = await q(`
        select s.* from faro.saga_pasos s join faro.pagos p on p.id=s.pago_id where p.lote_id=$1 order by s.id`, [loteId]);
      return rows;
    },
    async pagosEnEspera(limite = 20) {
      const { rows } = await q(`select id from faro.pagos where estado='EN_ESPERA' and intentos < 12 order by actualizado limit $1`, [limite]);
      return rows.map((r) => r.id);
    },
    // ---- Consentimientos Open Banking
    async guardarConsentimiento(c) {
      await q(`insert into faro.consentimientos (id,cuenta,estado,token) values ($1,$2,$3,$4)
               on conflict (id) do update set estado=excluded.estado, token=coalesce(excluded.token, faro.consentimientos.token)`,
      [c.id, c.cuenta, c.estado, c.token || null]);
    },
    async consentimientoVigente() {
      const { rows: [c] } = await q(`select * from faro.consentimientos where estado='AUTORIZADO' order by creado desc limit 1`);
      return c;
    },
    async marcarConsentimiento(id, estado) {
      await q(`update faro.consentimientos set estado=$2 where id=$1`, [id, estado]);
    },
  };
}
