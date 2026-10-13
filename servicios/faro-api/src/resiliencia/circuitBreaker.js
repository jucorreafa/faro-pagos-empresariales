// ---------------------------------------------------------------------------
// CIRCUIT BREAKER (S6) — escrito a mano, sin librerías, para que se lea fácil.
//
//   CERRADO  ──(N fallas seguidas)──▶  ABIERTO  ──(pasa el tiempo)──▶  SEMIABIERTO
//      ▲                                                                   │
//      └───────────────(la llamada de prueba funciona)────────────────────┘
//                      (si la prueba falla, vuelve a ABIERTO)
//
// Mientras está ABIERTO no se llama al servicio caído: se falla de inmediato.
// Así no hacemos esperar a los clientes ni rematamos a un servicio enfermo.
// ---------------------------------------------------------------------------
export class CircuitoAbierto extends Error {
  constructor(nombre, reintentarEn) {
    super(`Circuito ${nombre} ABIERTO: no se llamó al servicio`);
    this.circuitoAbierto = true;
    this.reintentarEn = reintentarEn;
  }
}

export class CircuitBreaker {
  constructor(nombre, { umbralFallas = 3, tiempoAbiertoMs = 20_000 } = {}) {
    this.nombre = nombre;
    this.umbralFallas = umbralFallas;
    this.tiempoAbiertoMs = tiempoAbiertoMs;
    this.estado = 'CERRADO';
    this.fallasSeguidas = 0;
    this.abiertoHasta = 0;
    this.pruebaEnCurso = false;
    this.contadores = { exitos: 0, fallas: 0, rechazadasPorCircuito: 0 };
    this.historial = []; // últimas transiciones, para la PWA
  }

  cambiar(nuevo, motivo) {
    if (nuevo === this.estado) return;
    this.historial.unshift({ de: this.estado, a: nuevo, motivo, fecha: new Date().toISOString() });
    this.historial = this.historial.slice(0, 15);
    this.estado = nuevo;
  }

  /** ¿Este error cuenta como falla del servicio? (4xx = culpa nuestra, no del servicio) */
  static esFallaDelServicio(e) {
    return !e.status || e.status >= 500 || e.status === 429;
  }

  async ejecutar(fn) {
    if (this.estado === 'ABIERTO') {
      if (Date.now() < this.abiertoHasta) {
        this.contadores.rechazadasPorCircuito++;
        throw new CircuitoAbierto(this.nombre, new Date(this.abiertoHasta).toISOString());
      }
      this.cambiar('SEMIABIERTO', 'Pasó el tiempo de espera: se permite una llamada de prueba');
    }
    if (this.estado === 'SEMIABIERTO') {
      if (this.pruebaEnCurso) {
        this.contadores.rechazadasPorCircuito++;
        throw new CircuitoAbierto(this.nombre, new Date(Date.now() + 2000).toISOString());
      }
      this.pruebaEnCurso = true;
    }
    try {
      const r = await fn();
      this.contadores.exitos++;
      this.fallasSeguidas = 0;
      if (this.estado === 'SEMIABIERTO') this.cambiar('CERRADO', 'La llamada de prueba funcionó');
      return r;
    } catch (e) {
      if (CircuitBreaker.esFallaDelServicio(e)) {
        this.contadores.fallas++;
        this.fallasSeguidas++;
        if (this.estado === 'SEMIABIERTO' || this.fallasSeguidas >= this.umbralFallas) {
          this.abiertoHasta = Date.now() + this.tiempoAbiertoMs;
          this.cambiar('ABIERTO', this.estado === 'SEMIABIERTO'
            ? 'La llamada de prueba falló'
            : `${this.fallasSeguidas} fallas seguidas (${e.message})`);
        }
      } else {
        this.fallasSeguidas = 0; // un 4xx demuestra que el servicio SÍ responde
      }
      throw e;
    } finally {
      this.pruebaEnCurso = false;
    }
  }

  /** Para el docente: cerrar el circuito a mano. */
  reiniciar() {
    this.fallasSeguidas = 0;
    this.cambiar('CERRADO', 'Reiniciado manualmente');
  }

  foto() {
    return {
      nombre: this.nombre,
      estado: this.estado,
      fallasSeguidas: this.fallasSeguidas,
      umbralFallas: this.umbralFallas,
      tiempoAbiertoSeg: this.tiempoAbiertoMs / 1000,
      abiertoHasta: this.estado === 'ABIERTO' ? new Date(this.abiertoHasta).toISOString() : null,
      contadores: this.contadores,
      historial: this.historial,
    };
  }
}
