const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware para verificar Token JWT
const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Obtener token del header "Bearer <TOKEN>"
      token = req.headers.authorization.split(' ')[1];

      // Decodificar token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Adjuntar usuario a la req (excluyendo password)
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        return res.status(401).json({ message: 'Usuario no encontrado' });
      }

      next();
    } catch (error) {
      return res.status(401).json({ message: 'No autorizado, token fallido' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'No autorizado, no hay token' });
  }
};

// Middleware para restringir acceso por Rol
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({
        message: `El rol '${req.user.rol}' no tiene permiso para acceder a esta ruta`,
      });
    }
    next();
  };
};

module.exports = { protect, authorize };