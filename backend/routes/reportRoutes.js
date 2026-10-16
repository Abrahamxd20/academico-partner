const express = require('express');
const router = express.Router();
const { protect, soloDocente } = require('../middleware/authMiddleware');
const reporteController = require('../controllers/reporteController');

router.use(protect, soloDocente);

router.get('/dashboard', reporteController.dashboard);
router.get('/borradores', reporteController.listarBorradores);
router.get('/ficha-observacion', reporteController.fichaObservacion);
router.get('/notas', reporteController.listarNotas);
router.get('/notas/:progressId/historial', reporteController.historialNota);
router.patch('/notas/:progressId', reporteController.ajustarNota);
router.post('/notas/:progressId/restaurar/:revisionId', reporteController.restaurarNota);

module.exports = router;
