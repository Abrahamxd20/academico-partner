// backend/controllers/evaluacionController.js

const obtenerEvaluaciones = async (req, res) => {
  try {
    res.json({ mensaje: "Obteniendo evaluaciones correctamente" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const evaluarConGemini = async (req, res) => {
  try {
    res.json({ mensaje: "Evaluación procesada con exito" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  obtenerEvaluaciones,
  evaluarConGemini,
};