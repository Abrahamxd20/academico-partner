const mongoose = require('mongoose');

const GradeRevisionSchema = new mongoose.Schema({
  progressId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentProgress', required: true, index: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, enum: ['ajuste', 'restauracion'], required: true },
  nivel: { type: String, enum: ['general', 'literal', 'inferencial', 'critico'], required: true },
  antes: { type: Number, default: null },
  despues: { type: Number, required: true },
  motivo: { type: String, required: true, maxlength: 500 },
  restauraRevisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'GradeRevision', default: null },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

GradeRevisionSchema.index({ progressId: 1, createdAt: -1 });

module.exports = mongoose.model('GradeRevision', GradeRevisionSchema, 'graderevisions');
