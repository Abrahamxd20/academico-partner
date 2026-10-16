const mongoose = require('mongoose');

const QuestionRetrySchema = new mongoose.Schema({
  alumnoId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  readingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lectura', required: true },
  preguntaOrigenId: { type: Number, required: true },
  numeroIntento: { type: Number, required: true },
  nivel: { type: String, enum: ['literal', 'inferencial', 'critico'], required: true },
  pista: { type: String, required: true },
  enunciado: { type: String, required: true },
  opciones: [{ id: { type: String, required: true }, texto: { type: String, required: true } }],
  respuestaCorrecta: { type: String, required: true },
  opcionElegida: { type: String, default: '' },
  correcta: { type: Boolean, default: null },
  respondidaEn: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

QuestionRetrySchema.index({ alumnoId: 1, readingId: 1, preguntaOrigenId: 1, numeroIntento: 1 }, { unique: true });
QuestionRetrySchema.index({ alumnoId: 1, readingId: 1, createdAt: -1 });

module.exports = mongoose.model('QuestionRetry', QuestionRetrySchema, 'questionretries');
