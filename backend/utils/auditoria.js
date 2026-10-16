const crypto = require('crypto');
const AuditLog = require('../models/AuditLog');
const { JWT_SECRET } = require('../config/jwt');

const crearHuella = (evento) => crypto
  .createHmac('sha256', JWT_SECRET)
  .update(JSON.stringify([
    String(evento.actorId?._id || evento.actorId), evento.actorRole, evento.action, evento.entity,
    evento.entityId ? String(evento.entityId?._id || evento.entityId) : '',
    evento.affectedUserId ? String(evento.affectedUserId?._id || evento.affectedUserId) : '',
    evento.details || {}, new Date(evento.createdAt).toISOString(),
  ]))
  .digest('hex');

async function registrarAccion(req, { action, entity, entityId, affectedUserId, details = {} }, { session } = {}) {
  if (!req.user?.id) return null;
  const evento = {
    actorId: req.user.id,
    actorRole: String(req.user.rol || '').toLowerCase(),
    action,
    entity,
    entityId: entityId || null,
    affectedUserId: affectedUserId || null,
    details,
    createdAt: new Date(),
  };
  evento.integrityHash = crearHuella(evento);
  if (session) {
    const [guardado] = await AuditLog.create([evento], { session });
    return guardado;
  }
  return AuditLog.create(evento);
}

const huellaValida = (evento) => {
  const esperado = crearHuella(evento);
  const recibido = Buffer.from(evento.integrityHash || '', 'hex');
  const calculado = Buffer.from(esperado, 'hex');
  return recibido.length === calculado.length && crypto.timingSafeEqual(recibido, calculado);
};

module.exports = { registrarAccion, huellaValida };
