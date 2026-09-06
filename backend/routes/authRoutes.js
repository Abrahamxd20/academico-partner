const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  getUserProfile,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// Rutas Públicas
router.post('/register', registerUser);
router.post('/login', loginUser);

// Ruta Privada (Requiere Token)
router.get('/profile', protect, getUserProfile);

module.exports = router;