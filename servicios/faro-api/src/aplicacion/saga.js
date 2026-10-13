// ===========================================================================
// SAGA ORQUESTADA de un pago (S6)
//
//   Paso 1  Banco Andino: debitar la cuenta de la empresa      (ref FARO-<pago>)
//   Paso 2  BCE: liquidar hacia el banco del beneficiario      (Idempotency-Key faro-<pago>)
//   Si el BCE RECHAZA (respuesta definitiva) ......... COMPENSAR: devolver el dinero a la empresa
//   Si NO SABEMOS qué pasó (caída, tiempo agotado) ... EN_ESPERA: se reintenta con la MISMA llave
//
// Regla de oro: solo se compensa cuando hay certeza. Ante la duda se espera y
// se reintenta; la idempotencia garantiza que reintentar no paga dos veces.
// ===========================================================================
import { puedeCambiar } from '../dominio/reglas.js';

export function crearSaga({ repo, banco, bce, empresa, proyector }) {
  async function mover(pago, nuevoEstado, extra = {}) {
    if (!puedeCambiar(pago.estado, nuevoEstado)) {
      throw new Error(`Transición inválida ${pago.estado} → ${nuevoEstado}`);
    }
    await repo.actualizarPago(pago.id, { estado: nuevoEstado, ...extra });
    Object.assign(pago, { estado: nuevoEstado, ...extra });
  }

  const describir = (e) => (e.circuitoAbierto
    ? `Circuit Breaker ABIERTO: ni siquiera se llamó (${e.message})`
    : e.message);

  async function compensar(pago, correlationId) {
    try {
      await banco.acreditar({
        cuenta: empresa.cuenta, monto: Number(pago.monto),
        referencia: `REV-FARO-${pago.id}`, concepto: `Reverso pago a ${pago.beneficiario}`,
      }, correlationId);
      await repo.pasoSaga(pago.id, 'COMPENSACION_DEVOLVER_A_EMPRESA', 'COMPENSACION', 'Se devolvió el dinero a la empresa');
      await mover(pago, 'COMPENSADO', { ultimo_error: pago.ultimo_error });
    } catch (e) {
      await repo.pasoSaga(pago.id, 'COMPENSACION_DEVOLVER_A_EMPRESA', 'ESPERA', `No se pudo compensar aún: ${describir(e)}`);
      await mover(pago, 'EN_ESPERA', { ultimo_error: 'Compensación pendiente: ' + describir(e) });
    }
  }

  /** Ejecuta (o continúa) la saga de un pago. Es seguro llamarla varias veces. */
  async function ejecutar(pagoId, correlationId) {
    const pago = await repo.pago(pagoId);
    if (!pago || ['LIQUIDADO', 'COMPENSADO', 'FALLIDO'].includes(pago.estado)) return pago;
    await repo.actualizarPago(pago.id, { intentos: pago.intentos + 1 });

    try {
      // Caso especial: el BCE ya rechazó y falta devolver el dinero.
      if (pago.debitado && pago.bce_estado === 'RJCT') {
        await compensar(pago, correlationId);
        return pago;
      }

      // ---------------- Paso 1: débito a la empresa
      if (!pago.debitado) {
        try {
          await banco.debitar({
            cuenta: empresa.cuenta, monto: Number(pago.monto),
            referencia: `FARO-${pago.id}`, concepto: `${pago.tipo_lote} · ${pago.beneficiario}`,
          }, correlationId);
          await repo.pasoSaga(pago.id, 'DEBITO_EMPRESA', 'OK', `Banco Andino debitó ${pago.monto} USD de ${empresa.cuenta}`);
          await mover(pago, 'DEBITADO', { debitado: true, ultimo_error: null });
        } catch (e) {
          if (e.status === 409 || e.status === 404 || e.status === 422) {
            await repo.pasoSaga(pago.id, 'DEBITO_EMPRESA', 'ERROR', e.message);
            await mover(pago, 'FALLIDO', { ultimo_error: e.message });
            return pago;
          }
          await repo.pasoSaga(pago.id, 'DEBITO_EMPRESA', 'ESPERA', describir(e));
          await mover(pago, 'EN_ESPERA', { ultimo_error: describir(e) });
          return pago;
        }
      }

      // ---------------- Paso 2: liquidación en el BCE
      try {
        const r = await bce.transferir({
          pagoId: pago.id, creado: new Date(pago.lote_creado).toISOString(), monto: Number(pago.monto),
          deudorNombre: empresa.nombre, deudorCuenta: empresa.cuenta,
          destino: pago.banco, acreedorNombre: pago.beneficiario, acreedorCuenta: pago.cuenta,
          concepto: `${pago.tipo_lote === 'NOMINA' ? 'Nómina' : 'Pago'} ${empresa.nombre}`.slice(0, 140),
        }, correlationId);
        const t = r.cuerpo;
        if (t.TxSts === 'ACSC') {
          await repo.pasoSaga(pago.id, 'LIQUIDACION_BCE', 'OK',
            `BCE liquidó (${t.transferenciaId.slice(0, 8)})${r.repetida ? ' · respuesta repetida por idempotencia' : ''}`);
          await mover(pago, 'LIQUIDADO', { bce_estado: 'ACSC', bce_transferencia: t.transferenciaId, ultimo_error: null });
        } else {
          const motivo = `${t.StsRsnInf?.Cd}: ${t.StsRsnInf?.AddtlInf}`;
          await repo.pasoSaga(pago.id, 'LIQUIDACION_BCE', 'ERROR', `BCE rechazó · ${motivo}`);
          await repo.actualizarPago(pago.id, { bce_estado: 'RJCT', bce_transferencia: t.transferenciaId, ultimo_error: motivo });
          Object.assign(pago, { bce_estado: 'RJCT', ultimo_error: motivo });
          await compensar(pago, correlationId);
        }
      } catch (e) {
        if (e.status && e.status >= 400 && e.status < 500 && e.status !== 409 && e.status !== 429) {
          // Error de contrato: definitivo, el BCE nunca liquidará este mensaje.
          await repo.pasoSaga(pago.id, 'LIQUIDACION_BCE', 'ERROR', `Contrato rechazado: ${e.message}`);
          pago.ultimo_error = e.message;
          await compensar(pago, correlationId);
        } else {
          await repo.pasoSaga(pago.id, 'LIQUIDACION_BCE', 'ESPERA', `${describir(e)} · se reintentará con la misma Idempotency-Key`);
          await mover(pago, 'EN_ESPERA', { ultimo_error: describir(e) });
        }
      }
      return pago;
    } finally {
      proyector.actualizar(pago.lote_id); // CQRS: refresca el modelo de lectura
    }
  }

  return { ejecutar };
}
