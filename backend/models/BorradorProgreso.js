const mongoose = require('mongoose');

/**
 * Borrador de progreso: lo que el alumno lleva avanzado MIENTRAS resuelve una lectura
 * (respuestas marcadas, subrayados, textos, tiempo acumulado).
 *
 * Es distinto de StudentProgress, que es el resultado FINAL ya calculado (IDLI, Inflesz, ROUGE...)
 * y el que alimenta los dashboards del docente. Así los borradores no ensucian las métricas.
 *
 * Hay UN documento por (alumno, lectura): se va sobrescribiendo con cada autoguardado.
 */
const BorradorProgresoSchema = new mongoose.Schema(
  {
    alumnoId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    readingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lectura', required: true },

    respuestas: { type: Object, default: {} },      // { [idPregunta]: 'A' | 'B' | ... }
    textoLiteral: { type: String, default: '' },
    respuestaInferencial: { type: String, default: '' },
    respuestaCritico: { type: String, default: '' },
    subrayados: { type: Object, default: {} },      // { [indiceParrafo]: [{ inicio, fin, color }] }
    vocabulario: { type: [mongoose.Schema.Types.Mixed], default: [] },
    mensajesChat: { type: [mongoose.Schema.Types.Mixed], default: [] },
    retroalimentacionTexto: { type: String, default: '' },
    seccionActual: { type: String, default: '' },

    tiempoSeg: { type: Number, default: 0 },        // tiempo activo acumulado de lectura

    // true cuando el alumno ya envió la evaluación (se bloquean más cambios y reenvíos)
    enviado: { type: Boolean, default: false },
    fechaEnvio: { type: Date },
  },
  { timestamps: true, minimize: false } // minimize:false → conserva los objetos vacíos {}
);

// Un solo borrador por alumno y lectura. También hace atómico el "reclamo" al enviar.
BorradorProgresoSchema.index({ alumnoId: 1, readingId: 1 }, { unique: true });

module.exports = mongoose.model('BorradorProgreso', BorradorProgresoSchema, 'borradoresprogreso');
