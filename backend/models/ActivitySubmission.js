const mongoose = require('mongoose');

const GradeRevisionSchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  antes: { type: Number, default: null },
  despues: { type: Number, min: 0, max: 100, default: null },
  motivo: { type: String, trim: true, default: '' },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const ActivitySubmissionSchema = new mongoose.Schema({
  cursoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Curso', required: true, index: true },
  sesionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  actividadId: { type: mongoose.Schema.Types.ObjectId, required: true },
  lecturaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lectura', required: true },
  alumnoId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  planVersion: { type: Number, required: true, min: 1 },
  tipoEvidencia: { type: String, required: true },
  respuesta: { type: String, required: true, maxlength: 12000 },
  puntaje: { type: Number, min: 0, max: 100, default: null },
  retroalimentacion: { type: String, default: '' },
  preguntaRefuerzo: { type: String, default: '' },
  revisionesNota: { type: [GradeRevisionSchema], default: [] },
  intento: { type: Number, min: 1, default: 1 },
  estado: { type: String, enum: ['evaluada', 'pendiente'], default: 'evaluada' },
}, { timestamps: true });

ActivitySubmissionSchema.index({ cursoId: 1, actividadId: 1, alumnoId: 1, createdAt: -1 });
ActivitySubmissionSchema.index({ cursoId: 1, createdAt: -1 });

module.exports = mongoose.model('ActivitySubmission', ActivitySubmissionSchema, 'activitysubmissions');
