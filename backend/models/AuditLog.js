const mongoose = require('mongoose');

// Registro de solo creación para reconstruir quién realizó una acción y cuándo.
const AuditLogSchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  actorRole: { type: String, required: true },
  action: { type: String, required: true, index: true },
  entity: { type: String, required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
  affectedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  integrityHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, index: true },
}, { versionKey: false, timestamps: false });

AuditLogSchema.index({ createdAt: -1, action: 1 });
AuditLogSchema.index({ actorId: 1, createdAt: -1 });
AuditLogSchema.index({ affectedUserId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema, 'auditlogs');
