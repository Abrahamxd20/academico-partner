const { registrarAccion } = require('../utils/auditoria');

const RUTAS_AUDITABLES = [
  '/api/cursos', '/api/biblioteca', '/api/auth/users', '/api/auth/me',
  '/api/auth/me/config', '/api/progreso/borrador', '/api/ai/chat',
];

module.exports = function auditarMutaciones(req, res, next) {
  const mutacion = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  const rutaAuditable = RUTAS_AUDITABLES.some((ruta) => req.path === ruta || req.path.startsWith(`${ruta}/`));
  if (!mutacion || !rutaAuditable) return next();

  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300 || !req.user?.id) return;
    const ruta = `${req.baseUrl || ''}${req.route?.path || req.path}`;
    const esRutaUsuarios = req.path.startsWith('/api/auth/users');
    registrarAccion(req, {
      action: `${req.method.toLowerCase()} ${ruta}`,
      entity: (req.path.startsWith('/api/ai/') ? 'ai' : req.path.split('/').filter(Boolean).slice(1, 2)[0]) || 'api',
      entityId: req.params?.id || req.params?.sid || req.params?.aid || req.params?.readingId || req.body?.readingId || null,
      affectedUserId: req.params?.alumnoId || req.body?.alumnoId || (esRutaUsuarios ? req.params?.id : null),
      details: {
        status: res.statusCode,
        campos: Object.keys(req.body || {}).slice(0, 30),
      },
    }).catch((error) => console.error('[auditoría] No se pudo guardar la acción:', error.message));
  });

  next();
};
