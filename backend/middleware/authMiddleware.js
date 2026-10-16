const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/jwt');
const User = require('../models/User');

// Normaliza los nombres de rol que existieron en distintas versiones del sistema.
const GRUPOS = {
  alumno: ['alumno', 'estudiante'],
  docente: ['docente', 'profesor'],
  admin: ['admin'],
};
const rolDe = (req) => (req.user?.rol || '').toLowerCase();
const esDelGrupo = (req, ...grupos) => grupos.some((g) => GRUPOS[g].includes(rolDe(req)));

// Exige un token JWT válido: "Authorization: Bearer <token>"
const protect = (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ mensaje: 'No autorizado, no hay token' });
  }
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET); // { id, rol, iat, exp }
    return next();
  } catch (error) {
    return res.status(401).json({ mensaje: 'No autorizado, token inválido o vencido' });
  }
};

// Solo docentes / admin
const soloDocente = (req, res, next) => {
  if (!esDelGrupo(req, 'docente', 'admin')) {
    console.log(`Acceso denegado a usuario ID: ${req.user?.id} con rol: ${req.user?.rol}`);
    return res.status(403).json({ mensaje: 'No tienes permiso para ver esta sección' });
  }
  next();
};

// Cuenta propietaria única: el rol del token no basta para acceder al panel sensible.
const soloAdmin = async (req, res, next) => {
  const correoAutorizado = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!correoAutorizado) {
    return res.status(503).json({ mensaje: 'El acceso administrativo no está configurado en el servidor' });
  }
  try {
    const usuario = await User.findById(req.user?.id).select('email rol activo').lean();
    const correoUsuario = String(usuario?.email || '').trim().toLowerCase();
    if (!usuario || usuario.activo === false || String(usuario.rol || '').toLowerCase() !== 'admin' || correoUsuario !== correoAutorizado) {
      return res.status(403).json({ mensaje: 'Esta cuenta no está autorizada para la administración' });
    }
    req.user.rol = usuario.rol;
    req.user.email = correoUsuario;
    next();
  } catch (error) {
    console.error('No se pudo verificar la cuenta administradora:', error.message);
    res.status(503).json({ mensaje: 'No se pudo verificar el acceso administrativo' });
  }
};

// Solo alumnos (p. ej. para registrar progreso: un docente probando no debe ensuciar las métricas)
const soloAlumno = (req, res, next) => {
  if (!esDelGrupo(req, 'alumno')) {
    return res.status(403).json({ mensaje: 'Solo los alumnos pueden realizar esta acción' });
  }
  next();
};

module.exports = { protect, soloDocente, soloAlumno, soloAdmin };
