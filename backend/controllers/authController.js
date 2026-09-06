const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Función helper para generar JWT
const generateToken = (id, rol) => {
  return jwt.sign({ id, rol }, process.env.JWT_SECRET, {
    expiresIn: '8h', // Token válido por un turno lectivo/jornada
  });
};

// @desc    Registrar nuevo usuario (Alumno, Docente o Admin)
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { nombre, email, password, rol, grado, seccion } = req.body;

    // Verificar si el usuario ya existe
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'El correo ya está registrado' });
    }

    // Crear usuario
    const user = await User.create({
      nombre,
      email,
      password,
      rol: rol || 'alumno',
      grado,
      seccion,
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        grado: user.grado,
        seccion: user.seccion,
        token: generateToken(user._id, user.rol),
      });
    } else {
      res.status(400).json({ message: 'Datos de usuario inválidos' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error en el servidor', error: error.message });
  }
};

// @desc    Autenticar usuario y obtener Token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Buscar usuario por correo
    const user = await User.findOne({ email });

    // Validar contraseña
    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        grado: user.grado,
        seccion: user.seccion,
        token: generateToken(user._id, user.rol),
      });
    } else {
      res.status(401).json({ message: 'Credenciales inválidas (correo o contraseña incorrectos)' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error en el servidor', error: error.message });
  }
};

// @desc    Obtener perfil del usuario autenticado
// @route   GET /api/auth/profile
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ message: 'Usuario no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error en el servidor', error: error.message });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
};