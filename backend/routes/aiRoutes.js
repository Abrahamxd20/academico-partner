// backend/routes/aiRoutes.js
const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');

// Ruta del chatbot que conecta con la función del controlador
router.post('/chat', aiController.atenderConsultaIA);

module.exports = router;