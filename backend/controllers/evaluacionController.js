const mongoose = require('mongoose');
const Lectura = require('../models/Lectura');
const QuestionAttempt = require('../models/QuestionAttempt');
const QuestionRetry = require('../models/QuestionRetry');
const { registrarAccion } = require('../utils/auditoria');
const { generarTexto } = require('../ia/gemini');
const Curso = require('../models/Curso');
const { comprobarAccesoActividad } = require('../utils/rutaAprendizaje');

/**
 * Lectura semilla, usada solo si todavía no hay ninguna en la base de datos
 * (para que el sistema funcione desde el primer arranque).
 */
const LECTURA_SEMILLA = {
  titulo: 'El tiempo libre y la creatividad',
  tipo: 'Texto argumentativo',
  tiempoEstimado: '5 min',
  tiempoEstimadoMin: 5,
  parrafos: [
    'En el mundo moderno, el tiempo libre se ha convertido en un bien escaso. Los adolescentes de hoy en día enfrentan una agenda cada vez más cargada: clases, tareas, actividades extracurriculares y compromisos sociales ocupan la mayor parte de sus horas. Sin embargo, numerosos estudios en psicología y neurociencia sugieren que el aburrimiento —esa sensación incómoda de no tener nada que hacer— puede ser, paradójicamente, uno de los estados mentales más productivos para el desarrollo creativo.',
  ],
  preguntasOpcionMultiple: [
    {
      id: 1,
      enunciado: '¿Cuál es la tesis principal del texto?',
      opciones: [
        { id: 'A', texto: 'Los adolescentes tienen demasiadas actividades extracurriculares.' },
        { id: 'B', texto: 'El aburrimiento puede ser beneficioso para el desarrollo creativo.' },
        { id: 'C', texto: 'La tecnología es perjudicial para la salud mental.' },
        { id: 'D', texto: 'Los neurocientíficos no comprenden cómo funciona el cerebro.' },
      ],
      respuestaCorrecta: 'B',
    },
  ],
  preguntaLiteral: {
    enunciado: 'Con tus propias palabras, ¿de qué trata el texto?',
  },
  preguntaInferencial: {
    enunciado: '¿Por qué crees que el aburrimiento puede ayudar a la creatividad, aunque el texto no lo diga de forma directa en todas sus partes?',
    respuestaReferencia: 'El aburrimiento obliga a la mente a buscar estímulos por sí misma, generando nuevas ideas, porque al no haber una actividad externa que ocupe la atención, el cerebro empieza a divagar y a conectar ideas de forma libre, lo cual favorece el pensamiento creativo.',
  },
  preguntaCritico: {
    enunciado: '¿Estás de acuerdo con la idea del texto? Justifica tu opinión relacionando al menos dos ideas de la lectura.',
    respuestaReferencia: 'Estoy de acuerdo porque el texto plantea que la agenda cargada de los adolescentes no deja espacio para el aburrimiento, y que la neurociencia respalda que ese estado mental favorece la creatividad, por lo que reducir el tiempo libre podría estar afectando negativamente el desarrollo creativo de los jóvenes.',
  },
};

const ESTADOS_NO_VISIBLES = ['Archivado', 'Borrador']; // (también cubre lecturas antiguas sin campo "estado")

async function validarRutaAlumno(req, readingId, cursoId, actividadId) {
  if (!['alumno', 'estudiante'].includes(String(req.user?.rol || '').toLowerCase())) return null;
  let coincidencias = [];
  if (cursoId || actividadId) {
    if (!mongoose.isValidObjectId(cursoId) || !mongoose.isValidObjectId(actividadId)) return { status: 400, mensaje: 'Falta identificar el curso y la actividad de la ruta' };
    const curso = await Curso.findOne({ _id: cursoId, alumnos: req.user.id, activo: { $ne: false } });
    if (!curso) return { status: 403, mensaje: 'No tienes matrícula activa en este curso' };
    for (const sesion of curso.sesiones || []) {
      const actividad = sesion.actividades.id(actividadId);
      if (actividad && sesion.visible !== false && actividad.visible !== false && String(actividad.lectura) === String(readingId)) {
        coincidencias.push({ curso, actividad });
      }
    }
    if (!coincidencias.length) return { status: 403, mensaje: 'La lectura no corresponde a esta actividad del curso' };
  } else {
    const cursos = await Curso.find({ alumnos: req.user.id, activo: { $ne: false }, 'sesiones.actividades.lectura': readingId });
    for (const curso of cursos) for (const sesion of curso.sesiones || []) for (const actividad of sesion.actividades || []) {
      if (sesion.visible !== false && actividad.visible !== false && String(actividad.lectura) === String(readingId)) coincidencias.push({ curso, actividad });
    }
  }
  if (!coincidencias.length) return null; // lectura personal/de biblioteca fuera de una secuencia curricular
  const accesos = await Promise.all(coincidencias.map(({ curso, actividad }) => comprobarAccesoActividad(curso, actividad._id, req.user.id)));
  if (accesos.some((acceso) => acceso.desbloqueada)) return null;
  return { status: 423, mensaje: 'Esta actividad aún está bloqueada. Completa la actividad anterior con al menos 70/100.' };
}

async function obtenerOCrearLecturaActiva(id) {
  if (id && mongoose.isValidObjectId(id)) {
    const elegida = await Lectura.findOne({ _id: id, estado: { $nin: ESTADOS_NO_VISIBLES } });
    if (elegida) return elegida;
  }
  // Por defecto: la lectura publicada más antigua que tenga preguntas (las "solo PDF" no sirven para evaluar).
  let lectura = await Lectura.findOne({
    estado: { $nin: ESTADOS_NO_VISIBLES },
    'preguntasOpcionMultiple.0': { $exists: true },
  }).sort({ createdAt: 1 });
  if (!lectura) {
    lectura = await Lectura.create(LECTURA_SEMILLA);
  }
  return lectura;
}

/**
 * GET /api/evaluacion/actividad-actual
 * Devuelve la lectura activa al alumno sin claves ni respuestas de referencia.
 */
exports.obtenerEvaluaciones = async (req, res) => {
  try {
    const lectura = await obtenerOCrearLecturaActiva(req.query.id);
    const bloqueo = await validarRutaAlumno(req, lectura._id, req.query.cursoId, req.query.actividadId);
    if (bloqueo) return res.status(bloqueo.status).json({ mensaje: bloqueo.mensaje });

    res.json({
      readingId: lectura._id,
      tipo: lectura.tipo,
      tiempoEstimado: lectura.tiempoEstimado,
      tiempoEstimadoMin: lectura.tiempoEstimadoMin,
      titulo: lectura.titulo,
      estrategias: lectura.estrategias || [], // HU5
      pdfUrl: lectura.pdfUrl || null,
      parrafos: lectura.parrafos,
      preguntas: lectura.preguntasOpcionMultiple.map((pregunta) => ({
        id: pregunta.id,
        nivel: pregunta.nivel,
        enunciado: pregunta.enunciado,
        opciones: (pregunta.opciones || []).map(({ id, texto }) => ({ id, texto })),
      })),

      // Solo los enunciados, nunca la respuesta de referencia
      preguntaLiteral: { enunciado: lectura.preguntaLiteral?.enunciado },
      preguntaInferencial: { enunciado: lectura.preguntaInferencial?.enunciado },
      preguntaCritico: { enunciado: lectura.preguntaCritico?.enunciado },
    });
  } catch (error) {
    console.error('Error en obtenerEvaluaciones:', error);
    res.status(500).json({ mensaje: 'Error al obtener la lectura activa', error: error.message });
  }
};

// La respuesta correcta nunca se entrega al navegador. El servidor la evalúa y
// registra el primer intento para impedir que se prueben opciones desde la API.
exports.responderPregunta = async (req, res) => {
  try {
    const { readingId, questionId, opcionId } = req.body || {};
    if (!mongoose.isValidObjectId(readingId) || !Number.isInteger(Number(questionId))
      || typeof opcionId !== 'string' || opcionId.length > 10) {
      return res.status(400).json({ mensaje: 'La respuesta enviada no es válida' });
    }
    const bloqueo = await validarRutaAlumno(req, readingId, req.body.cursoId, req.body.actividadId);
    if (bloqueo) return res.status(bloqueo.status).json({ mensaje: bloqueo.mensaje });

    const lectura = await Lectura.findOne({ _id: readingId, estado: { $nin: ESTADOS_NO_VISIBLES } });
    if (!lectura) return res.status(404).json({ mensaje: 'Esta lectura no está disponible' });
    const pregunta = lectura.preguntasOpcionMultiple.find((item) => item.id === Number(questionId));
    if (!pregunta || !pregunta.opciones.some((opcion) => opcion.id === opcionId)) {
      return res.status(400).json({ mensaje: 'La pregunta o alternativa no existe' });
    }

    const alumnoId = req.user.id;
    const existente = await QuestionAttempt.findOne({ alumnoId, readingId, questionId: pregunta.id }).lean();
    if (existente) {
      if (existente.opcionId !== opcionId) return res.status(409).json({ mensaje: 'Esta pregunta ya fue respondida' });
      return res.json({ correcta: existente.correcta, repetida: true, retroalimentacion: existente.correcta
        ? '¡Correcto! Explica qué parte del texto te ayudó a elegir.'
        : 'Esa alternativa no coincide con el texto. Pide una pista y vuelve a intentarlo con otra pregunta.' });
    }

    const correcta = pregunta.respuestaCorrecta === opcionId;
    let intento;
    try {
      intento = await QuestionAttempt.create({ alumnoId, readingId, questionId: pregunta.id, opcionId, correcta });
    } catch (error) {
      if (error.code !== 11000) throw error;
      return res.status(409).json({ mensaje: 'Esta pregunta ya fue respondida' });
    }

    try {
      await registrarAccion(req, {
        action: 'evaluacion.pregunta.respondida', entity: 'QuestionAttempt', entityId: intento._id,
        affectedUserId: alumnoId,
        details: { readingId: String(readingId), questionId: pregunta.id, correcta },
      });
    } catch (errorAuditoria) {
      console.error('[auditoría] No se pudo guardar el intento en el historial:', errorAuditoria.message);
    }

    return res.json({ correcta, retroalimentacion: correcta
      ? '¡Correcto! Explica qué parte del texto te ayudó a elegir.'
      : 'Esa alternativa no coincide con el texto. Pide una pista y vuelve a intentarlo con otra pregunta.' });
  } catch (error) {
    console.error('Error al revisar la respuesta:', error);
    return res.status(500).json({ mensaje: 'No se pudo revisar la respuesta' });
  }
};

exports.generarReintento = async (req, res) => {
  try {
    const { readingId, questionId } = req.body || {};
    if (!mongoose.isValidObjectId(readingId) || !Number.isInteger(Number(questionId))) {
      return res.status(400).json({ mensaje: 'La lectura o pregunta no es válida' });
    }
    const bloqueo = await validarRutaAlumno(req, readingId, req.body.cursoId, req.body.actividadId);
    if (bloqueo) return res.status(bloqueo.status).json({ mensaje: bloqueo.mensaje });
    const alumnoId = req.user.id;
    const [lectura, original, intentoOriginal, totalReintentos] = await Promise.all([
      Lectura.findOne({ _id: readingId, estado: { $nin: ESTADOS_NO_VISIBLES } }).lean(),
      Lectura.findOne({ _id: readingId, 'preguntasOpcionMultiple.id': Number(questionId) }, { 'preguntasOpcionMultiple.$': 1 }).lean(),
      QuestionAttempt.findOne({ alumnoId, readingId, questionId: Number(questionId) }).lean(),
      QuestionRetry.countDocuments({ alumnoId, readingId, preguntaOrigenId: Number(questionId) }),
    ]);
    const pregunta = original?.preguntasOpcionMultiple?.[0];
    if (!lectura || !pregunta || !intentoOriginal) return res.status(404).json({ mensaje: 'No se encontró el intento para esta pregunta' });
    if (intentoOriginal.correcta) return res.status(409).json({ mensaje: 'Ya respondiste correctamente esta pregunta' });
    if (totalReintentos >= 3) return res.status(429).json({ mensaje: 'Ya usaste los tres reintentos disponibles para este criterio' });

    const texto = (lectura.parrafos || []).join('\n').slice(0, 9000);
    const alternativaIncorrecta = pregunta.opciones.find((opcion) => opcion.id === intentoOriginal.opcionId)?.texto || '';
    const prompt = `
Eres especialista en comprensión lectora para secundaria. Crea UNA pregunta de opción múltiple alternativa a la que el estudiante respondió mal.
La nueva pregunta debe evaluar el mismo nivel (${pregunta.nivel || 'literal'}) y la misma habilidad, pero usar otro enfoque y evidencia distinta del texto. No repitas la pregunta original ni reveles la respuesta en el enunciado.
TEXTO:
"""${texto}"""
PREGUNTA ORIGINAL (solo para identificar la habilidad): ${pregunta.enunciado}
ALTERNATIVA ELEGIDA INCORRECTAMENTE: ${alternativaIncorrecta}
Primero crea una pista breve que ayude a revisar la posible confusión, sin revelar la respuesta. Luego crea la pregunta alternativa.
Responde solo JSON válido con esta forma: {"pista":"...","enunciado":"...","opciones":[{"id":"A","texto":"..."},{"id":"B","texto":"..."},{"id":"C","texto":"..."},{"id":"D","texto":"..."}],"respuestaCorrecta":"A"}
Debe haber exactamente cuatro opciones A, B, C y D; una sola respuesta correcta. Basa todo en el texto y usa lenguaje claro para adolescentes.
`;
    let alternativa;
    try {
      const bruto = (await generarTexto(prompt, { responseMimeType: 'application/json' })).trim()
        .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      alternativa = JSON.parse(bruto);
    } catch (error) {
      console.error('[reintento IA] No se pudo generar una alternativa:', error.message);
      return res.status(502).json({ mensaje: 'No se pudo crear otra pregunta ahora. Inténtalo nuevamente.' });
    }
    const idsEsperados = ['A', 'B', 'C', 'D'];
    if (typeof alternativa.pista !== 'string' || alternativa.pista.trim().length < 8 || alternativa.pista.length > 500
      || typeof alternativa.enunciado !== 'string' || alternativa.enunciado.trim().length < 8
      || !Array.isArray(alternativa.opciones) || alternativa.opciones.length !== 4
      || alternativa.opciones.some((opcion, i) => opcion.id !== idsEsperados[i] || typeof opcion.texto !== 'string' || !opcion.texto.trim())
      || !idsEsperados.includes(alternativa.respuestaCorrecta)) {
      return res.status(502).json({ mensaje: 'La nueva pregunta no pasó la revisión de calidad. Prueba otra vez.' });
    }

    const numeroIntento = totalReintentos + 1;
    let nueva;
    try {
      nueva = await QuestionRetry.create({
        alumnoId, readingId, preguntaOrigenId: Number(questionId), numeroIntento,
        nivel: pregunta.nivel || 'literal', pista: alternativa.pista.trim(), enunciado: alternativa.enunciado.trim(),
        opciones: alternativa.opciones.map(({ id, texto: opcion }) => ({ id, texto: opcion.trim() })),
        respuestaCorrecta: alternativa.respuestaCorrecta,
      });
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ mensaje: 'Ya se está preparando un reintento para esta pregunta' });
      throw error;
    }
    try {
      await registrarAccion(req, { action: 'evaluacion.reintento.generado', entity: 'QuestionRetry', entityId: nueva._id,
        affectedUserId: alumnoId, details: { readingId: String(readingId), preguntaOrigenId: Number(questionId), nivel: nueva.nivel } });
    } catch (errorAuditoria) { console.error('[auditoría] No se registró la generación del reintento:', errorAuditoria.message); }

    return res.status(201).json({ reintento: {
      _id: nueva._id, preguntaOrigenId: nueva.preguntaOrigenId, numeroIntento: nueva.numeroIntento,
      nivel: nueva.nivel, pista: nueva.pista, enunciado: nueva.enunciado, opciones: nueva.opciones,
    } });
  } catch (error) {
    console.error('Error al generar el reintento:', error);
    return res.status(500).json({ mensaje: 'No se pudo preparar otra pregunta' });
  }
};

exports.listarReintentos = async (req, res) => {
  try {
    const { readingId } = req.query || {};
    if (!mongoose.isValidObjectId(readingId)) return res.status(400).json({ mensaje: 'La lectura no es válida' });
    const bloqueo = await validarRutaAlumno(req, readingId, req.query.cursoId, req.query.actividadId);
    if (bloqueo) return res.status(bloqueo.status).json({ mensaje: bloqueo.mensaje });
    const reintentos = await QuestionRetry.find({ alumnoId: req.user.id, readingId }).sort({ createdAt: 1 }).lean();
    return res.json({ reintentos: reintentos.map(({ respuestaCorrecta, ...item }) => item) });
  } catch (error) {
    console.error('Error al recuperar los reintentos:', error);
    return res.status(500).json({ mensaje: 'No se pudieron recuperar tus preguntas de reintento' });
  }
};

exports.listarIntentos = async (req, res) => {
  try {
    const { readingId } = req.query || {};
    if (!mongoose.isValidObjectId(readingId)) return res.status(400).json({ mensaje: 'La lectura no es válida' });
    const bloqueo = await validarRutaAlumno(req, readingId, req.query.cursoId, req.query.actividadId);
    if (bloqueo) return res.status(bloqueo.status).json({ mensaje: bloqueo.mensaje });
    const intentos = await QuestionAttempt.find({ alumnoId: req.user.id, readingId })
      .select('questionId opcionId correcta fecha').sort({ fecha: 1 }).lean();
    return res.json({ intentos });
  } catch (error) {
    console.error('Error al recuperar los intentos:', error);
    return res.status(500).json({ mensaje: 'No se pudieron recuperar tus respuestas' });
  }
};

exports.responderReintento = async (req, res) => {
  try {
    const { opcionId } = req.body || {};
    const reintento = await QuestionRetry.findOne({ _id: req.params.reintentoId, alumnoId: req.user.id });
    if (!reintento) return res.status(404).json({ mensaje: 'No se encontró este reintento' });
    const bloqueo = await validarRutaAlumno(req, reintento.readingId, req.body.cursoId, req.body.actividadId);
    if (bloqueo) return res.status(bloqueo.status).json({ mensaje: bloqueo.mensaje });
    if (!reintento.opciones.some((opcion) => opcion.id === opcionId)) return res.status(400).json({ mensaje: 'La alternativa no es válida' });
    if (reintento.respondidaEn) {
      if (reintento.opcionElegida !== opcionId) return res.status(409).json({ mensaje: 'Este reintento ya fue respondido' });
      return res.json({ correcta: reintento.correcta, repetida: true });
    }
    const correcta = reintento.respuestaCorrecta === opcionId;
    const guardado = await QuestionRetry.findOneAndUpdate(
      { _id: reintento._id, alumnoId: req.user.id, respondidaEn: null },
      { $set: { opcionElegida: opcionId, correcta, respondidaEn: new Date() } },
      { new: true }
    );
    if (!guardado) {
      const yaRespondido = await QuestionRetry.findById(reintento._id).lean();
      if (yaRespondido?.opcionElegida === opcionId) return res.json({ correcta: yaRespondido.correcta, repetida: true });
      return res.status(409).json({ mensaje: 'Este reintento ya fue respondido' });
    }
    try {
      await registrarAccion(req, { action: 'evaluacion.reintento.respondido', entity: 'QuestionRetry', entityId: reintento._id,
        affectedUserId: req.user.id, details: { readingId: String(guardado.readingId), preguntaOrigenId: guardado.preguntaOrigenId,
          numeroIntento: guardado.numeroIntento, correcta: guardado.correcta } });
    } catch (errorAuditoria) { console.error('[auditoría] No se registró la respuesta del reintento:', errorAuditoria.message); }
    return res.json({ correcta: guardado.correcta, retroalimentacion: guardado.correcta
      ? '¡Lo lograste! Aplicaste la pista al mismo objetivo.'
      : 'Aún no coincide con el texto. Revisa la pista y, si quieres, prueba otra pregunta del mismo objetivo.' });
  } catch (error) {
    console.error('Error al revisar el reintento:', error);
    return res.status(500).json({ mensaje: 'No se pudo revisar el reintento' });
  }
};

// Se mantiene por compatibilidad con la ruta existente; el guardado real ahora
// ocurre en progresoController.guardarProgreso (POST /api/progreso).
exports.evaluarConGemini = async (req, res) => {
  try {
    res.json({ mensaje: 'Usa POST /api/progreso para registrar respuestas.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
