const express = require('express');
const router = express.Router();
const { protect, soloAlumno } = require('../middleware/authMiddleware');
const evaluacionController = require('../controllers/evaluacionController');

router.use(protect);

router.get('/actividad-actual', evaluacionController.obtenerEvaluaciones);
router.post('/responder', soloAlumno, evaluacionController.responderPregunta);
router.get('/intentos', soloAlumno, evaluacionController.listarIntentos);
router.get('/reintentos', soloAlumno, evaluacionController.listarReintentos);
router.post('/reintentos', soloAlumno, evaluacionController.generarReintento);
router.post('/reintentos/:reintentoId/responder', soloAlumno, evaluacionController.responderReintento);
router.post('/actividad-actual', evaluacionController.evaluarConGemini);

module.exports = router;
