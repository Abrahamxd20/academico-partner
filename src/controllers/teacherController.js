import Question from '../models/Question.js';
import StudentProgress from '../models/StudentProgress.js';
import User from '../models/User.js';
import ExcelJS from 'exceljs';

// --- GESTIÓN DE PREGUNTAS ---

// Agregar o Actualizar Pregunta
export const upsertQuestion = async (req, res) => {
  try {
    const { id, lecturaId, enunciado, opciones, respuestaCorrecta } = req.body;
    
    if (id) {
      const updated = await Question.findByIdAndUpdate(
        id, 
        { enunciado, opciones, respuestaCorrecta }, 
        { new: true }
      );
      return res.json({ mensaje: 'Pregunta actualizada', question: updated });
    }

    const newQuestion = await Question.create({ lecturaId, enunciado, opciones, respuestaCorrecta });
    res.status(201).json(newQuestion);
  } catch (error) {
    res.status(500).json({ message: 'Error al procesar la pregunta', error: error.message });
  }
};

// Obtener preguntas de una lectura
export const getQuestionsByReading = async (req, res) => {
  try {
    const questions = await Question.find({ lecturaId: req.params.lecturaId });
    res.json(questions);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener preguntas', error: error.message });
  }
};

// --- MONITOREO EN TIEMPO REAL ---

// Obtener el avance de los estudiantes por sección
export const getStudentProgressBySection = async (req, res) => {
  try {
    const { seccion } = req.params;
    
    // Obtener todos los alumnos de la sección
    const estudiantes = await User.find({ seccion, rol: 'student' }).select('nombre email');
    
    // Obtener el progreso registrado
    const avances = await StudentProgress.find()
      .populate('estudiante', 'nombre email seccion')
      .populate('lectura', 'titulo');

    // Filtrar por la sección requerida
    const avanceFiltrado = avances.filter(a => a.estudiante && a.estudiante.seccion === seccion);

    res.json({ estudiantes, avances: avanceFiltrado });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener avance', error: error.message });
  }
};

// --- EXPORTAR A EXCEL ---

export const exportProgressToExcel = async (req, res) => {
  try {
    const { seccion } = req.params;
    const avances = await StudentProgress.find()
      .populate('estudiante', 'nombre email seccion')
      .populate('lectura', 'titulo');

    const lista = avances.filter(a => a.estudiante && a.estudiante.seccion === seccion);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Reporte ${seccion}`);

    worksheet.columns = [
      { header: 'Estudiante', key: 'estudiante', width: 25 },
      { header: 'Correo', key: 'email', width: 25 },
      { header: 'Lectura', key: 'lectura', width: 30 },
      { header: 'Puntaje (%)', key: 'puntaje', width: 15 },
      { header: 'Estado', key: 'completado', width: 15 },
      { header: 'Fecha de Entrega', key: 'fecha', width: 20 }
    ];

    lista.forEach(item => {
      worksheet.addRow({
        estudiante: item.estudiante.nombre,
        email: item.estudiante.email,
        lectura: item.lectura.titulo,
        puntaje: `${item.puntaje}%`,
        completado: item.completado ? 'Completado' : 'En Proceso',
        fecha: new Date(item.updatedAt).toLocaleDateString()
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Reporte_Lecturas_${seccion}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ message: 'Error al generar el reporte Excel', error: error.message });
  }
};