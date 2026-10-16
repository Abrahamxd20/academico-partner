const mongoose = require('mongoose');

const CursoPlanVersionSchema = new mongoose.Schema({
  cursoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Curso', required: true, index: true },
  version: { type: Number, required: true },
  snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  action: { type: String, required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

CursoPlanVersionSchema.index({ cursoId: 1, version: -1 }, { unique: true });

module.exports = mongoose.model('CursoPlanVersion', CursoPlanVersionSchema, 'cursoplanversions');
