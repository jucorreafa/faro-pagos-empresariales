import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from './api.js';

/** Consulta periódica (polling) a un endpoint. */
export function useSondeo(servicio, ruta, cadaMs = 3000, activo = true) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const vivo = useRef(true);
  const cargar = useCallback(async () => {
    try {
      const r = await api(servicio, ruta, { timeoutMs: 20000 });
      if (vivo.current) { setDatos(r.datos); setError(null); }
    } catch (e) {
      if (vivo.current) setError(e);
    }
  }, [servicio, ruta]);
  useEffect(() => {
    vivo.current = true;
    if (!activo || !ruta) return undefined;
    cargar();
    const t = setInterval(cargar, cadaMs);
    return () => { vivo.current = false; clearInterval(t); };
  }, [cargar, cadaMs, activo, ruta]);
  return { datos, error, recargar: cargar };
}

/** Estado de los 3 servicios (despierta a Render gratuito al abrir la app). */
export function useSaludSistema() {
  const [estado, setEstado] = useState({ faro: 'despertando', bce: 'despertando', banco: 'despertando' });
  const [detalle, setDetalle] = useState({});
  useEffect(() => {
    let vivo = true;
    const revisar = async (s) => {
      try {
        const r = await api(s, '/salud', { timeoutMs: 90000 });
        if (!vivo) return;
        setDetalle((d) => ({ ...d, [s]: r.datos }));
        setEstado((e) => ({ ...e, [s]: r.datos.estado === 'OK' ? 'ok' : 'apagado' }));
      } catch {
        if (vivo) setEstado((e) => ({ ...e, [s]: 'caido' }));
      }
    };
    const todos = () => ['faro', 'bce', 'banco'].forEach(revisar);
    todos();
    const t = setInterval(todos, 10000);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  return { estado, detalle };
}

/** Para acciones con botón: maneja cargando / resultado / error. */
export function useAccion(fn) {
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);
  const ejecutar = async (...args) => {
    setCargando(true);
    setError(null);
    try {
      const r = await fn(...args);
      setResultado(r);
      return r;
    } catch (e) {
      setError(e);
      return null;
    } finally {
      setCargando(false);
    }
  };
  return { ejecutar, cargando, resultado, error, setResultado };
}
