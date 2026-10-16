const express = require('express');
const router = express.Router();
const { protect, soloDocente, soloAlumno } = require('../middleware/authMiddleware');
const cursoController = require('../controllers/cursoController');
const versionarPlanCurso = require('../middleware/versionarPlanCurso');
const { generarPreguntasConIA, extraerTextoPdf } = require('../ia/generadorPreguntas');
const { textoAParrafos } = require('../ia/textoPdf');
const { registrarAccion } = require('../utils/auditoria');

router.use(protect);

// Ruta para generar preguntas con IA basada en una lectura
router.post('/generar-preguntas', soloDocente, async (req, res) => {
  try {
    const { lecturaId } = req.body;
    if (!lecturaId) return res.status(400).json({ message: 'ID de lectura requerido' });

    const Lectura = require('../models/Lectura');
    const lectura = await Lectura.findById(lecturaId);
    if (!lectura) return res.status(404).json({ message: `No existe una lectura con id ${lecturaId}` });

    let texto = '';
    if (lectura.pdfUrl) texto = await extraerTextoPdf(lectura.pdfUrl);
    if (!texto.trim() && lectura.parrafos?.length) texto = lectura.parrafos.join('\n');
    if (texto.trim().length < 200) {
      return res.status(422).json({
        message: 'El PDF casi no tiene texto que leer (¿es una imagen escaneada?). Sube un PDF con texto seleccionable.',
      });
    }

    // Lo que se envía a la IA: queda en la terminal para poder comprobar que es el archivo correcto.
    console.log(`[generar-preguntas] lectura=${lectura._id} archivo="${lectura.nombreArchivo || lectura.titulo}" caracteres=${texto.length}`);
    console.log(`[generar-preguntas] inicio del texto: ${texto.trim().slice(0, 120).replace(/\s+/g, ' ')}`);

    // Lecturas subidas antes de este cambio: se completa su texto para que el alumno lo vea.
    if (!lectura.parrafos?.length) {
      lectura.parrafos = textoAParrafos(texto);
      await lectura.save();
    }

    const preguntas = await generarPreguntasConIA(texto);
    await registrarAccion(req, { action: 'lectura.preguntas.generadas', entity: 'Lectura', entityId: lectura._id, details: { cantidad: preguntas.preguntasOpcionMultiple.length, niveles: ['literal', 'inferencial', 'critico'] } });
    res.json({
      ...preguntas,
      // Confirmación para la docente: de qué archivo salieron las preguntas.
      fuente: { titulo: lectura.titulo, archivo: lectura.nombreArchivo || null, caracteres: texto.length },
    });
  } catch (error) {
    console.error('Error generando preguntas con IA:', error);
    res.status(500).json({ message: `Error al generar preguntas: ${error.message}` });
  }
});

// Cualquier usuario autenticado ve "sus" cursos (el controlador filtra según el rol).
router.get('/', cursoController.listar);

// Ver un curso: el docente dueño / admin, o un alumno MATRICULADO (el controlador valida el acceso).
router.get('/:id', cursoController.obtener);
router.get('/:id/historial-plan', soloDocente, cursoController.historialPlan);
router.get('/:id/evidencias', soloDocente, cursoController.reporteEvidencias);
router.patch('/:id/evidencias/:entregaId', soloDocente, cursoController.calificarEvidencia);
router.post('/:id/evidencias/:entregaId/restaurar/:revisionId', soloDocente, cursoController.restaurarCalificacionEvidencia);
router.get('/:id/evidencias/:aid/mias', soloAlumno, cursoController.misEvidencias);
router.post('/:id/sesiones/:sid/actividades/:aid/evidencias', soloAlumno, cursoController.entregarEvidencia);

// Gestión del curso y la matrícula: docente (sus cursos) o admin.
router.post('/', soloDocente, cursoController.crear);
router.put('/:id', soloDocente, versionarPlanCurso, cursoController.actualizar);
router.delete('/:id', soloDocente, versionarPlanCurso, cursoController.eliminar);
router.post('/:id/historial-plan/:version/restaurar', soloDocente, versionarPlanCurso, cursoController.restaurarPlan);
router.post('/:id/matricular', soloDocente, cursoController.matricular);
router.delete('/:id/alumnos/:alumnoId', soloDocente, cursoController.desmatricular);

// Sesiones y actividades (devuelven el curso completo ya actualizado).
router.post('/:id/sesiones', soloDocente, versionarPlanCurso, cursoController.crearSesion);
router.put('/:id/sesiones/:sid', soloDocente, versionarPlanCurso, cursoController.actualizarSesion);
router.delete('/:id/sesiones/:sid', soloDocente, versionarPlanCurso, cursoController.eliminarSesion);

router.post('/:id/sesiones/:sid/actividades', soloDocente, versionarPlanCurso, cursoController.crearActividad);
router.put('/:id/sesiones/:sid/actividades/:aid', soloDocente, versionarPlanCurso, cursoController.actualizarActividad);
router.delete('/:id/sesiones/:sid/actividades/:aid', soloDocente, versionarPlanCurso, cursoController.eliminarActividad);

module.exports = router;
