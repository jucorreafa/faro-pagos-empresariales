// ---------------------------------------------------------------------------
// BULKHEAD / MAMPARO (S6): compartimentos separados, como en un barco.
// La nómina (muchos pagos) y los pagos urgentes tienen piscinas distintas.
// Si la nómina se atasca, los urgentes siguen saliendo por su propio carril.
// ---------------------------------------------------------------------------
export class ColaLlena extends Error {
  constructor(nombre) {
    super(`Compartimento ${nombre} lleno: se rechaza para proteger al sistema`);
    this.colaLlena = true;
  }
}

export class Bulkhead {
  constructor(nombre, { maxConcurrentes = 2, maxCola = 100 } = {}) {
    this.nombre = nombre;
    this.maxConcurrentes = maxConcurrentes;
    this.maxCola = maxCola;
    this.activos = 0;
    this.cola = [];
    this.contadores = { completados: 0, rechazados: 0 };
    this.trabajos = []; // últimos trabajos con tiempos, para la PWA
  }

  ejecutar(etiqueta, fn) {
    if (this.cola.length >= this.maxCola) {
      this.contadores.rechazados++;
      return Promise.reject(new ColaLlena(this.nombre));
    }
    const registro = { etiqueta, encolado: Date.now(), inicio: null, fin: null };
    this.trabajos.unshift(registro);
    this.trabajos = this.trabajos.slice(0, 30);
    return new Promise((resolve, reject) => {
      this.cola.push({ fn, resolve, reject, registro });
      this.siguiente();
    });
  }

  siguiente() {
    while (this.activos < this.maxConcurrentes && this.cola.length) {
      const t = this.cola.shift();
      this.activos++;
      t.registro.inicio = Date.now();
      Promise.resolve()
        .then(t.fn)
        .then(t.resolve, t.reject)
        .finally(() => {
          t.registro.fin = Date.now();
          this.activos--;
          this.contadores.completados++;
          this.siguiente();
        });
    }
  }

  foto() {
    return {
      nombre: this.nombre,
      maxConcurrentes: this.maxConcurrentes,
      activos: this.activos,
      enCola: this.cola.length,
      contadores: this.contadores,
      trabajos: this.trabajos.slice(0, 12).map((t) => ({
        etiqueta: t.etiqueta,
        esperaMs: t.inicio ? t.inicio - t.encolado : Date.now() - t.encolado,
        duracionMs: t.fin ? t.fin - t.inicio : null,
        estado: t.fin ? 'TERMINADO' : t.inicio ? 'EN_CURSO' : 'EN_COLA',
      })),
    };
  }
}
