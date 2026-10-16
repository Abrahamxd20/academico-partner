const mongoose = require('mongoose');
const StudentProgress = require('../models/StudentProgress');
const BorradorProgreso = require('../models/BorradorProgreso');
const Lectura = require('../models/Lectura');
const { generarAcompañamiento } = require('../ia/feedbackAsistente');
const { registrarAccion } = require('../utils/auditoria');
const QuestionAttempt = require('../models/QuestionAttempt');
const QuestionRetry = require('../models/QuestionRetry');
const Curso = require('../models/Curso');
const { comprobarAccesoActividad } = require('../utils/rutaAprendizaje');

// ---------- Saneamiento de lo que manda el frontend (borrador y envío final) ----------
const LIMITE_TEXTO = 5000;
const COLORES_SUBRAYADO = ['amarillo', 'verde', 'celeste', 'vocabulario'];
const esObjetoPlano = (v) => v && typeof v === 'object' && !Array.isArray(v);

const limpiarTexto = (v) => (typeof v === 'string' ? v.slice(0, LIMITE_TEXTO) : '');

// { "1": "B", "2": "D" } → solo claves numéricas y valores string cortos (evita claves raras en Mongo)
const limpiarRespuestas = (obj) => {
  const out = {};
  if (!esObjetoPlano(obj)) return out;
  for (const [k, v] of Object.entries(obj).slice(0, 100)) {
    if (/^\d{1,4}$/.test(k) && typeof v === 'string' && v.length <= 10) out[k] = v;
  }
  return out;
};

// { "0": [{ inicio, fin, color }] }
const limpiarSubrayados = (obj) => {
  const out = {};
  if (!esObjetoPlano(obj)) return out;
  for (const [k, lista] of Object.entries(obj).slice(0, 200)) {
    if (!/^\d{1,4}$/.test(k) || !Array.isArray(lista)) continue;
    out[k] = lista
      .slice(0, 200)
      .filter((r) => r && Number.isInteger(r.inicio) && Number.isInteger(r.fin)
        && r.inicio >= 0 && r.fin > r.inicio && COLORES_SUBRAYADO.includes(r.color))
      .map(({ inicio, fin, color }) => ({ inicio, fin, color }));
  }
  return out;
};

const limpiarBorrador = (body = {}) => ({
  respuestas: limpiarRespuestas(body.respuestas),
  textoLiteral: limpiarTexto(body.textoLiteral),
  respuestaInferencial: limpiarTexto(body.respuestaInferencial),
  respuestaCritico: limpiarTexto(body.respuestaCritico),
  subrayados: limpiarSubrayados(body.subrayados),
  vocabulario: Array.isArray(body.vocabulario) ? body.vocabulario.slice(0, 100).map((item) => ({
    palabra: limpiarTexto(item?.palabra).slice(0, 100),
    definicion: limpiarTexto(item?.definicion),
  })).filter((item) => item.palabra) : [],
  mensajesChat: Array.isArray(body.mensajesChat) ? body.mensajesChat.slice(-100).map((item) => ({
    emisor: item?.emisor === 'user' ? 'user' : 'bot', texto: limpiarTexto(item?.texto),
  })).filter((item) => item.texto) : [],
  retroalimentacionTexto: limpiarTexto(body.retroalimentacionTexto),
  seccionActual: ['Lectura', 'Preguntas', 'Vocabulario', 'Asistente', 'Refuerzo'].includes(body.seccionActual) ? body.seccionActual : '',
});

/**
 * GET /api/progreso/borrador/:readingId
 * Devuelve lo que el alumno (el del token) llevaba avanzado en esa lectura, para restaurarlo
 * al recargar la página. Si no hay nada guardado devuelve { borrador: null }.
 * `yaEnviado` es true si ya mandó la evaluación (también cubre registros anteriores a esta mejora).
 */
exports.obtenerBorrador = async (req, res) => {
  try {
    const alumnoId = req.user.id;
    const { readingId } = req.params;
    if (!mongoose.isValidObjectId(readingId)) {
      return res.status(400).json({ mensaje: 'readingId no es válido' });
    }

    const [b, finalExiste] = await Promise.all([
      BorradorProgreso.findOne({ alumnoId, readingId }).lean(),
      StudentProgress.exists({ alumnoId, readingId }),
    ]);

    return res.json({
      yaEnviado: Boolean(b?.enviado || finalExiste),
      borrador: b
        ? {
            respuestas: b.respuestas || {},
            textoLiteral: b.textoLiteral || '',
            respuestaInferencial: b.respuestaInferencial || '',
            respuestaCritico: b.respuestaCritico || '',
            subrayados: b.subrayados || {},
            vocabulario: b.vocabulario || [],
            mensajesChat: b.mensajesChat || [],
            retroalimentacionTexto: b.retroalimentacionTexto || '',
            seccionActual: b.seccionActual || '',
            tiempoSeg: b.tiempoSeg || 0,
            actualizadoEn: b.updatedAt,
          }
        : null,
    });
  } catch (error) {
    console.error('Error al obtener el borrador:', error);
    return res.status(500).json({ mensaje: 'Error al obtener tu progreso guardado' });
  }
};

/**
 * PUT /api/progreso/borrador/:readingId
 * Autoguardado: crea o sobrescribe el borrador del alumno para esa lectura.
 * Si ya envió la evaluación, responde 409 y no modifica nada.
 */
exports.guardarBorrador = async (req, res) => {
  try {
    const alumnoId = req.user.id;
    const { readingId } = req.params;
    if (!mongoose.isValidObjectId(readingId)) {
      return res.status(400).json({ mensaje: 'readingId no es válido' });
    }
    if (!(await Lectura.exists({ _id: readingId }))) {
      return res.status(404).json({ mensaje: 'La lectura indicada no existe' });
    }

    const datos = limpiarBorrador(req.body);
    // Máximo 24 h; $max evita que una pestaña vieja "retroceda" el tiempo ya acumulado.
    const tiempoSeg = Math.min(Math.max(Number(req.body?.tiempoSeg) || 0, 0), 24 * 3600);

    try {
      await BorradorProgreso.findOneAndUpdate(
        { alumnoId, readingId, enviado: { $ne: true } },
        { $set: datos, $max: { tiempoSeg } },
        { upsert: true, setDefaultsOnInsert: true }
      );
    } catch (e) {
      // El filtro excluye los ya enviados; el upsert choca con el índice único → ya está enviado.
      if (e.code === 11000) {
        return res.status(409).json({ mensaje: 'Ya enviaste esta evaluación; no se puede modificar.' });
      }
      throw e;
    }

    return res.json({ ok: true, guardadoEn: new Date() });
  } catch (error) {
    console.error('Error al guardar el borrador:', error);
    return res.status(500).json({ mensaje: 'Error al guardar tu avance' });
  }
};

/**
 * POST /api/progreso
 *
 * Body esperado desde el frontend:
 * {
 *   "readingId": "...",
 *   "respuestasCorrectas": 1,
 *   "totalPreguntas": 1,
 *   "tiempoEstimadoMin": 5,
 *   "tiempoRealMin": 6.5,
 *   "textoLiteral": "Lo que el alumno escribió explicando el texto...",
 *   "respuestaInferencial": "Lo que escribió el alumno en la pregunta inferencial",
 *   "respuestaCritico": "Lo que escribió el alumno en la pregunta crítica"
 * }
 *
 * Nota: las respuestas de referencia (ideales) NUNCA vienen del frontend.
 * Se buscan aquí, del lado del servidor, a partir de la Lectura guardada.
 *
 * Respuesta al frontend: SOLO acompañamiento en texto, sin números ni porcentajes.
 */
exports.guardarProgreso = async (req, res) => {
  try {
    // El alumno es SIEMPRE el del token: antes cualquiera podía guardar progreso a nombre de otro.
    const alumnoId = req.user.id;
    const {
      readingId,
      cursoId,
      actividadId,
      respuestasCorrectas,
      totalPreguntas,
      tiempoEstimadoMin,
      tiempoRealMin,
      textoLiteral,
      respuestaInferencial,
      respuestaCritico,
      respuestas, // { [idPregunta]: 'A' | 'B' | ... } → el servidor calcula los aciertos
      subrayados,
      vocabulario,
      mensajesChat,
      retroalimentacionTexto,
    } = req.body;

    if (!readingId || !mongoose.isValidObjectId(readingId)) {
      return res.status(400).json({ mensaje: 'Falta readingId o no es válido' });
    }

    const lectura = await Lectura.findById(readingId);
    if (!lectura) {
      return res.status(404).json({ mensaje: 'La lectura indicada no existe' });
    }

    // La versión se obtiene del curso validado en el servidor; nunca se acepta
    // un número de versión enviado por el alumno.
    let cursoEvaluado = null;
    if (cursoId !== undefined && cursoId !== null && cursoId !== '') {
      if (!mongoose.isValidObjectId(cursoId)) return res.status(400).json({ mensaje: 'El curso indicado no es válido' });
      if (actividadId && !mongoose.isValidObjectId(actividadId)) return res.status(400).json({ mensaje: 'La actividad indicada no es válida' });
      if (!actividadId) return res.status(400).json({ mensaje: 'Identifica la actividad del curso antes de finalizar la evaluación' });
      cursoEvaluado = await Curso.findOne({
        _id: cursoId,
        alumnos: alumnoId,
        activo: { $ne: false },
        sesiones: { $elemMatch: {
          actividades: { $elemMatch: {
            lectura: readingId,
            ...(actividadId ? { _id: actividadId } : {}),
            visible: { $ne: false },
          } },
        } },
      }).select('_id planVersion sesiones').lean();
      if (!cursoEvaluado) return res.status(403).json({ mensaje: 'La lectura no está asignada en ese curso o no tienes matrícula activa' });
      const accesoRuta = await comprobarAccesoActividad(cursoEvaluado, actividadId, alumnoId);
      if (!accesoRuta.desbloqueada) return res.status(423).json({ mensaje: 'Completa la actividad anterior con al menos 70/100 antes de finalizar este paso.' });
    } else if (actividadId) return res.status(400).json({ mensaje: 'Para vincular una actividad también debes indicar el curso' });

    // Los aciertos se calculan AQUÍ comparando con las respuestas correctas guardadas en la lectura.
    // (Antes el frontend mandaba la cantidad de preguntas RESPONDIDAS, que no es lo mismo que acertadas.)
    const { preguntasOpcionMultiple = [] } = lectura.toObject();
    const total = preguntasOpcionMultiple.length;
    const respuestasLimpias = limpiarRespuestas(respuestas);
    const idsPregunta = preguntasOpcionMultiple.map((pregunta) => pregunta.id);
    const [intentosPregunta, reintentosCorrectos] = await Promise.all([
      QuestionAttempt.find({ alumnoId, readingId, questionId: { $in: idsPregunta } }).lean(),
      QuestionRetry.find({ alumnoId, readingId, preguntaOrigenId: { $in: idsPregunta }, correcta: true }).select('preguntaOrigenId').lean(),
    ]);
    if (intentosPregunta.length !== total) {
      return res.status(400).json({ mensaje: 'Responde todas las preguntas en la actividad antes de finalizar' });
    }
    const criteriosDominados = new Set([
      ...intentosPregunta.filter((intento) => intento.correcta).map((intento) => intento.questionId),
      ...reintentosCorrectos.map((intento) => intento.preguntaOrigenId),
    ]);
    const correctas = criteriosDominados.size;
    const respuestasManipuladas = esObjetoPlano(respuestas) && preguntasOpcionMultiple.some((pregunta) =>
      respuestasLimpias[String(pregunta.id)] !== intentosPregunta.find((intento) => intento.questionId === pregunta.id)?.opcionId);
    const notaClienteInconsistente = respuestasManipuladas
      || (respuestasCorrectas !== undefined && Number(respuestasCorrectas) !== correctas)
      || (totalPreguntas !== undefined && Number(totalPreguntas) !== total);

    // Sin estas validaciones, tiempoRealMin = 0 o null daba Infinity/NaN en la eficiencia temporal y el IDLI.
    const tiempoReal = Number(tiempoRealMin);
    const tiempoEstimado = Number(tiempoEstimadoMin) || lectura.tiempoEstimadoMin;
    if (!(total > 0)) {
      return res.status(400).json({ mensaje: 'Esta lectura no tiene preguntas de opción múltiple para evaluar' });
    }
    if (!esObjetoPlano(respuestas)) {
      return res.status(400).json({ mensaje: 'Responde las preguntas antes de finalizar la evaluación' });
    }
    if (!(tiempoReal > 0)) {
      return res.status(400).json({ mensaje: 'Falta el tiempo real de lectura (tiempoRealMin)' });
    }

    // Un alumno solo envía UNA vez cada lectura (antes cada clic creaba un registro nuevo y
    // los promedios del docente se inflaban). Registros anteriores a esta mejora también cuentan.
    const mensajeYaEnviado = 'Ya enviaste esta evaluación.';
    if (await StudentProgress.exists({ alumnoId, readingId })) {
      return res.status(409).json({ mensaje: mensajeYaEnviado });
    }
    // "Reclamo" atómico: si dos envíos llegan a la vez (doble clic), solo uno pasa.
    try {
      await BorradorProgreso.findOneAndUpdate(
        { alumnoId, readingId, enviado: { $ne: true } },
        {
          $set: {
            ...limpiarBorrador({ respuestas, textoLiteral, respuestaInferencial, respuestaCritico, subrayados, vocabulario, mensajesChat, retroalimentacionTexto }),
            enviado: true,
            fechaEnvio: new Date(),
          },
          $max: { tiempoSeg: Math.min(Math.round(tiempoReal * 60), 24 * 3600) },
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
    } catch (e) {
      if (e.code === 11000) return res.status(409).json({ mensaje: mensajeYaEnviado });
      throw e;
    }

    const nuevoProgreso = new StudentProgress({
      alumnoId,
      readingId,
      cursoId: cursoEvaluado?._id || null,
      actividadId: actividadId || null,
      planVersion: cursoEvaluado?.planVersion || null,
      respuestasCorrectas: correctas,
      totalPreguntas: total,
      tiempoEstimadoMin: tiempoEstimado,
      tiempoRealMin: tiempoReal,

      nivelLiteral: {
        texto: textoLiteral || '',
      },
      nivelInferencial: {
        respuestaReferencia: lectura.preguntaInferencial?.respuestaReferencia || '',
        respuestaAlumno: respuestaInferencial || '',
      },
      nivelCritico: {
        respuestaReferencia: lectura.preguntaCritico?.respuestaReferencia || '',
        respuestaAlumno: respuestaCritico || '',
      },
      subrayados: limpiarSubrayados(subrayados),
    });

    // El pre('save') de StudentProgress.js calcula automáticamente:
    // porcentajeAciertos, eficienciaTemporal, idli, inflesz, rougeL, rougeS
    const accionFinal = {
      action: 'evaluacion.enviada',
      entity: 'StudentProgress',
      entityId: nuevoProgreso._id,
      affectedUserId: alumnoId,
      details: {
        readingId: String(readingId),
        cursoId: cursoEvaluado ? String(cursoEvaluado._id) : null,
        actividadId: actividadId ? String(actividadId) : null,
        planVersion: cursoEvaluado?.planVersion || null,
        respuestasCorrectas: correctas,
        totalPreguntas: total,
        porcentajeAciertos: nuevoProgreso.porcentajeAciertos,
        niveles: {
          literal: nuevoProgreso.nivelLiteral?.inflesz ?? null,
          inferencial: nuevoProgreso.nivelInferencial?.rougeL ?? null,
          critico: nuevoProgreso.nivelCritico?.rougeS ?? null,
        },
        alertaIntegridad: notaClienteInconsistente,
      },
    };
    let session;
    try {
      if (process.env.MONGO_USE_TRANSACTIONS === 'true') {
        session = await mongoose.startSession();
        await session.withTransaction(async () => {
          await nuevoProgreso.save({ session });
          await registrarAccion(req, accionFinal, { session });
        });
      } else {
        await nuevoProgreso.save();
        try {
          await registrarAccion(req, accionFinal);
        } catch (errorAuditoria) {
          console.error('[auditoría] El progreso se guardó, pero no se pudo registrar la acción:', errorAuditoria.message);
        }
      }
    } catch (e) {
      // Si falló el guardado, se libera el borrador para que el alumno pueda reintentar.
      await BorradorProgreso.updateOne(
        { alumnoId, readingId },
        { $set: { enviado: false }, $unset: { fechaEnvio: 1 } }
      );
      throw e;
    } finally {
      if (session) await session.endSession().catch(() => {});
    }

    // Acompañamiento cualitativo a partir de lo YA calculado (nunca números al alumno)
    const acompañamiento = generarAcompañamiento({
      inflesz: nuevoProgreso.nivelLiteral?.inflesz,
      rougeL: nuevoProgreso.nivelInferencial?.rougeL,
      rougeS: nuevoProgreso.nivelCritico?.rougeS,
    });

    return res.status(201).json({
      mensaje: 'Progreso registrado correctamente',
      acompañamiento, // { literal, inferencial, critico } -> strings
    });
  } catch (error) {
    console.error('Error al guardar el progreso:', error);
    return res.status(500).json({ mensaje: 'Error al guardar el progreso', error: error.message });
  }
};
