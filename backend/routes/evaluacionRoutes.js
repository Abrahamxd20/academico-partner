const express = require('express');
const router = express.Router();
const evaluacionController = require('../controllers/evaluacionController');

// 1. RUTA GET: Carga la lectura y las preguntas
router.get('/actividad-actual', (req, res) => {
  res.json({
    tipo: "Texto argumentativo",
    tiempoEstimado: "5 min",
    titulo: "El tiempo libre y la creatividad",
    parrafos: [
      "En el mundo moderno, el tiempo libre se ha convertido en un bien escaso. Los adolescentes de hoy en día enfrentan una agenda cada vez más cargada: clases, tareas, actividades extracurriculares y compromisos sociales ocupan la mayor parte de sus horas. Sin embargo, numerosos estudios en psicología y neurociencia sugieren que el aburrimiento —esa sensación incómoda de no tener nada que hacer— puede ser, paradójicamente, uno de los estados mentales más productivos para el desarrollo creativo."
    ],
    preguntas: [
      {
        id: 1,
        enunciado: "¿Cuál es la tesis principal del texto?",
        opciones: [
          { id: "A", texto: "Los adolescentes tienen demasiadas actividades extracurriculares." },
          { id: "B", texto: "El aburrimiento puede ser beneficioso para el desarrollo creativo." },
          { id: "C", texto: "La tecnología es perjudicial para la salud mental." },
          { id: "D", texto: "Los neurocientíficos no comprenden cómo funciona el cerebro." }
        ],
        respuestaCorrecta: "B"
      },
      {
        id: 2,
        enunciado: "¿Qué descubrió Marcus Raichle en 2001?",
        opciones: [
          { id: "A", texto: "La red neuronal por defecto que se activa en reposo." },
          { id: "B", texto: "El impacto negativo del uso de redes sociales." },
          { id: "C", texto: "La relación entre nutrición y creatividad." },
          { id: "D", texto: "Técnicas de estudio intensivo para secundarios." }
        ],
        respuestaCorrecta: "A"
      }
    ]
  });
});

// 2. RUTA POST: Evaluación con Gemini
router.post('/actividad-actual', evaluacionController.evaluarRespuestaIA);

module.exports = router;