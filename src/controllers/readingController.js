import Reading from '../models/Reading.js';

// Crear una nueva lectura
export const createReading = async (req, res) => {
  try {
    const { titulo, descripcion, contenido, seccion, profesorId } = req.body;
    const newReading = await Reading.create({
      titulo,
      descripcion,
      contenido,
      seccion,
      profesor: profesorId
    });
    res.status(201).json(newReading);
  } catch (error) {
    res.status(500).json({ message: 'Error al crear la lectura', error: error.message });
  }
};

// Obtener lecturas creadas por el profesor
export const getTeacherReadings = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const readings = await Reading.find({ profesor: teacherId });
    res.json(readings);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener lecturas', error: error.message });
  }
};