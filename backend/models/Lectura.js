const mongoose = require('mongoose');

const LecturaSchema = new mongoose.Schema({
  titulo: { type: String, required: true },
  tipo: { type: String, default: 'Texto argumentativo' },
  tiempoEstimado: { type: String, default: '5 min' },
  tiempoEstimadoMin: { type: Number, default: 5 }, // usado para ETR
  parrafos: [{ type: String }],

  // --- Antes vivían en el modelo Libro. Ahora una Lectura es UNA sola entidad: ---
  // el PDF que sube el docente + el texto + sus preguntas + su estrategia.
  autor: { type: String, trim: true, default: '' },
  categoria: { type: String, trim: true, default: 'General' },
  pdfUrl: { type: String },            // ruta pública: /uploads/archivo.pdf
  nombreArchivo: { type: String },     // nombre original del PDF
  tamanioKB: { type: Number },
  subidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Visibilidad para el alumno. 'Borrador' se usará en HU5 (no publicar sin estrategia).
  estado: { type: String, enum: ['Borrador', 'Publicado', 'Archivado'], default: 'Publicado' },

  // HU5: estrategias de lectura asociadas (lectura guiada, en voz alta, ...)
  estrategias: [{ type: String }],

  // Preguntas de opción múltiple (para PA / ETR / IDLI, sistema que ya tenías)
  preguntasOpcionMultiple: [
    {
      nivel: { type: String, enum: ['literal', 'inferencial', 'critico'], default: 'literal' },
      id: { type: Number, required: true },
      enunciado: { type: String, required: true },
      opciones: [
        {
          id: { type: String, required: true }, // "A", "B", "C", "D"
          texto: { type: String, required: true },
        },
      ],
      respuestaCorrecta: { type: String, required: true },
    },
  ],

  // Prompt abierto — Nivel Literal (se mide con Inflesz sobre lo que escribe el alumno)
  preguntaLiteral: {
    enunciado: { type: String },
  },

  // Prompt abierto — Nivel Inferencial (se compara con ROUGE-L)
  preguntaInferencial: {
    enunciado: { type: String },
    respuestaReferencia: { type: String }, // NUNCA se envía al frontend
  },

  // Prompt abierto — Nivel Crítico (se compara con ROUGE-S)
  preguntaCritico: {
    enunciado: { type: String },
    respuestaReferencia: { type: String }, // NUNCA se envía al frontend
  },
}, { timestamps: true });

module.exports = mongoose.model('Lectura', LecturaSchema, 'lecturas');
