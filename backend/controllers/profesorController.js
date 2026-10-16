const StudentProgress = require('../models/StudentProgress');

exports.obtenerProgresoTesis = async (req, res) => {
  try {
    const progresos = await StudentProgress.find()
      .populate('alumnoId', 'nombre grado seccion')
      .populate('readingId', 'titulo')
      .sort({ fecha: -1 });

    res.json(progresos);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener reporte', error: error.message });
  }
};