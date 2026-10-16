const mongoose = require('mongoose');

const QuestionAttemptSchema = new mongoose.Schema({
  alumnoId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  readingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lectura', required: true },
  questionId: { type: Number, required: true },
  opcionId: { type: String, required: true },
  correcta: { type: Boolean, required: true },
  fecha: { type: Date, default: Date.now },
}, { versionKey: false });

QuestionAttemptSchema.index({ alumnoId: 1, readingId: 1, questionId: 1 }, { unique: true });

module.exports = mongoose.model('QuestionAttempt', QuestionAttemptSchema, 'questionattempts');
