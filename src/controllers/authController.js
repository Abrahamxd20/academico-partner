import User from '../models/User.js';
import jwt from 'jsonwebtoken';

const generateToken = (id, rol) => {
  return jwt.sign({ id, rol }, process.env.JWT_SECRET, { expiresIn: '8h' });
};

// @desc    Registrar nuevo usuario
// @route   POST /api/auth/register
export const registerUser = async (req, res) => {
  const { nombre, email, password, rol, seccion, codigoDocente } = req.body;

  try {
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'El correo electrónico ya está registrado' });
    }

    // Validar el código exclusivo para docentes
    if (rol === 'teacher') {
      const secretKey = process.env.TEACHER_SECRET_KEY || 'DOCENTE2026';
      if (codigoDocente !== secretKey) {
        return res.status(403).json({ message: 'Código de verificación docente incorrecto' });
      }
    }

    const user = await User.create({
      nombre,
      email,
      password,
      rol: rol || 'student',
      seccion: seccion || '4to A'
    });

    res.status(201).json({
      _id: user._id,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      seccion: user.seccion,
      token: generateToken(user._id, user.rol)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
// @desc    Iniciar sesión
// @route   POST /api/auth/login
export const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        seccion: user.seccion,
        token: generateToken(user._id, user.rol)
      });
    } else {
      res.status(401).json({ message: 'Credenciales inválidas' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};