const express = require('express');
const router = express.Router();
const { protect, soloAlumno } = require('../middleware/authMiddleware');
const { guardarProgreso, obtenerBorrador, guardarBorrador } = require('../controllers/progresoController');

// Envío final de la evaluación (calcula IDLI, Inflesz, ROUGE...)
router.post('/', protect, soloAlumno, guardarProgreso);

// Avance en curso: se restaura al recargar la página
router.get('/borrador/:readingId', protect, soloAlumno, obtenerBorrador);
router.put('/borrador/:readingId', protect, soloAlumno, guardarBorrador);

module.exports = router;
