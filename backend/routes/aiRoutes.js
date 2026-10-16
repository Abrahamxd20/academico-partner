const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { responderChat } = require('../ia/chat');

// El chat gasta cuota de la API de Gemini: solo usuarios autenticados.
router.post('/chat', protect, responderChat);

module.exports = router;
