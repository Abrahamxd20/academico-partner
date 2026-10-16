const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { protect, soloDocente, soloAdmin } = require('../middleware/authMiddleware');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/google-login', authController.googleLogin);

router.get('/me', protect, authController.obtenerPerfil);
router.put('/me', protect, authController.actualizarPerfil);
router.put('/me/config', protect, soloDocente, authController.actualizarConfigDocente);

router.get('/users', protect, soloAdmin, authController.listarUsuarios);
router.post('/users', protect, soloAdmin, authController.crearUsuario);
router.post('/users/:id/send-credentials', protect, soloAdmin, authController.reenviarCredenciales);
router.put('/users/:id', protect, soloAdmin, authController.actualizarUsuario);
router.delete('/users/:id', protect, soloAdmin, authController.eliminarUsuario);

module.exports = router;
