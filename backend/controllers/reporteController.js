const StudentProgress = require('../models/StudentProgress');
const User = require('../models/User');
const Lectura = require('../models/Lectura');
const { NIVELES } = require('../utils/reportes');
const { construirFicha } = require('../utils/fichaExcel');
const BorradorProgreso = require('../models/BorradorProgreso');
const mongoose = require('mongoose');
const Curso = require('../models/Curso');
const GradeRevision = require('../models/GradeRevision');
const { registrarAccion } = require('../utils/auditoria');

const VALORES_NIVEL = ['general', 'literal', 'inferencial', 'critico'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
const valorActualNivel = (p, nivel) => {
  const ajustado = p.notaAjustada?.[nivel];
  if (Number.isFinite(ajustado)) return ajustado;
  if (nivel === 'literal') return Number(p.nivelLiteral?.inflesz) || 0;
  if (nivel === 'inferencial') return (Number(p.nivelInferencial?.rougeL) || 0) * 100;
  if (nivel === 'critico') return (Number(p.nivelCritico?.rougeS) || 0) * 100;
  return Number(p.idli) || 0;
};

const limitarPuntajeMongo = (expresion) => ({ $min: [100, { $max: [0, { $ifNull: [expresion, 0] }] }] });
const expresionesPuntaje = {
  general: limitarPuntajeMongo({ $ifNull: ['$notaAjustada.general', '$idli'] }),
  literal: limitarPuntajeMongo({ $ifNull: ['$notaAjustada.literal', '$nivelLiteral.inflesz'] }),
  inferencial: limitarPuntajeMongo({ $ifNull: ['$notaAjustada.inferencial', { $multiply: [{ $ifNull: ['$nivelInferencial.rougeL', 0] }, 100] }] }),
  critico: limitarPuntajeMongo({ $ifNull: ['$notaAjustada.critico', { $multiply: [{ $ifNull: ['$nivelCritico.rougeS', 0] }, 100] }] }),
};

async function construirDashboardEnMongo(filtro, nivel, { grado, seccion } = {}) {
  const umbrales = { general: [80, 60, 40], literal: [80, 60, 40], inferencial: [50, 30, 15], critico: [35, 20, 10] }[nivel];
  const filtroMongo = { ...filtro };
  if (filtroMongo.readingId) {
    if (!mongoose.isValidObjectId(filtroMongo.readingId)) throw new Error('El filtro de lectura no es válido');
    filtroMongo.readingId = new mongoose.Types.ObjectId(filtroMongo.readingId);
  }
  const [resultado] = await StudentProgress.aggregate([
    { $match: filtroMongo },
    { $lookup: { from: User.collection.name, localField: 'alumnoId', foreignField: '_id', as: '_alumno' } },
    { $unwind: '$_alumno' },
    ...((grado || seccion) ? [{ $match: {
      ...(grado ? { '_alumno.grado': grado } : {}),
      ...(seccion ? { '_alumno.seccion': seccion } : {}),
    } }] : []),
    { $addFields: {
      _scoreGeneral: expresionesPuntaje.general,
      _scoreLiteral: expresionesPuntaje.literal,
      _scoreInferencial: expresionesPuntaje.inferencial,
      _scoreCritico: expresionesPuntaje.critico,
      _score: expresionesPuntaje[nivel],
    } },
    { $project: { alumnoId: 1, readingId: 1, fecha: 1, porcentajeAciertos: 1, eficienciaTemporal: 1,
      _score: 1, _scoreGeneral: 1, _scoreLiteral: 1, _scoreInferencial: 1, _scoreCritico: 1 } },
    { $facet: {
      resumen: [{ $group: { _id: null, intentos: { $sum: 1 }, promedio: { $avg: '$_score' }, pa: { $avg: '$porcentajeAciertos' }, etr: { $avg: '$eficienciaTemporal' },
        general: { $avg: '$_scoreGeneral' }, literal: { $avg: '$_scoreLiteral' }, inferencial: { $avg: '$_scoreInferencial' }, critico: { $avg: '$_scoreCritico' } } }],
      lecturas: [
        { $group: { _id: '$readingId', valor: { $avg: '$_score' }, intentos: { $sum: 1 } } },
        { $lookup: { from: Lectura.collection.name, localField: '_id', foreignField: '_id', as: 'lecturaInfo' } },
        { $unwind: { path: '$lecturaInfo', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 0, lectura: { $ifNull: ['$lecturaInfo.titulo', 'Sin título'] }, valor: { $round: ['$valor', 1] }, intentos: 1 } },
        { $sort: { valor: -1 } }, { $limit: 6 },
      ],
      bandas: [
        { $addFields: { banda: { $switch: { branches: [
          { case: { $gte: ['$_score', umbrales[0]] }, then: 'Destacado' },
          { case: { $gte: ['$_score', umbrales[1]] }, then: 'Logrado' },
          { case: { $gte: ['$_score', umbrales[2]] }, then: 'En proceso' },
        ], default: 'Requiere apoyo' } } } },
        { $group: { _id: '$banda', cantidad: { $sum: 1 } } },
      ],
      meses: [
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$fecha', timezone: 'America/Lima' } }, promedio: { $avg: '$_score' }, intentos: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ],
      alumnosTop: [
        { $group: { _id: '$alumnoId', promedio: { $avg: '$_score' }, intentos: { $sum: 1 } } },
        { $sort: { promedio: 1, _id: 1 } }, { $limit: 8 },
        { $lookup: { from: User.collection.name, localField: '_id', foreignField: '_id', as: 'alumnoInfo' } },
        { $unwind: '$alumnoInfo' },
        { $project: { _id: 0, nombre: { $ifNull: ['$alumnoInfo.nombre', 'Alumno'] }, grado: { $ifNull: ['$alumnoInfo.grado', ''] }, seccion: { $ifNull: ['$alumnoInfo.seccion', ''] }, intentos: 1, promedio: { $round: ['$promedio', 1] } } },
      ],
      alumnosTotal: [{ $group: { _id: '$alumnoId' } }, { $count: 'cantidad' }],
    } },
  ]).allowDiskUse(true);

  const resumen = resultado?.resumen?.[0] || {};
  const totalIntentos = resumen.intentos || 0;
  const conteoBandas = Object.fromEntries((resultado?.bandas || []).map(({ _id, cantidad }) => [_id, cantidad]));
  const meses = (resultado?.meses || []).map((item) => ({
    clave: item._id,
    etiqueta: `${MESES[Number(item._id.slice(5)) - 1]} ${item._id.slice(2, 4)}`,
    promedio: Number((item.promedio || 0).toFixed(1)),
    intentos: item.intentos,
  }));
  const bandas = ['Destacado', 'Logrado', 'En proceso', 'Requiere apoyo'];
  const alumnos = resultado?.alumnosTop || [];
  const totalAlumnos = resultado?.alumnosTotal?.[0]?.cantidad || 0;
  const porNivel = Object.fromEntries(['literal', 'inferencial', 'critico', 'general'].map((n) => [n, Number((resumen[n] || 0).toFixed(1))]));
  return {
    nivel,
    kpis: { intentos: totalIntentos, alumnos: totalAlumnos,
      promedio: Number((resumen.promedio || 0).toFixed(1)), idli: porNivel.general,
      pa: Number((resumen.pa || 0).toFixed(1)), etr: Number((resumen.etr || 0).toFixed(1)) },
    porNivel,
    porLectura: resultado?.lecturas || [],
    distribucion: bandas.map((banda) => ({ banda, cantidad: conteoBandas[banda] || 0,
      porcentaje: totalIntentos ? Number((((conteoBandas[banda] || 0) * 100) / totalIntentos).toFixed(1)) : 0 })),
    evolucion: meses,
    alumnos,
    totalAlumnos,
  };
}

async function progresoGestionable(req, res) {
  if (!mongoose.isValidObjectId(req.params.progressId)) {
    res.status(400).json({ mensaje: 'Identificador de nota no válido' });
    return null;
  }
  const progreso = await StudentProgress.findById(req.params.progressId);
  if (!progreso) {
    res.status(404).json({ mensaje: 'No se encontró la nota' });
    return null;
  }
  if (String(req.user?.rol).toLowerCase() !== 'admin') {
    const asignado = await Curso.exists({
      docente: req.user.id,
      alumnos: progreso.alumnoId,
      'sesiones.actividades.lectura': progreso.readingId,
      activo: { $ne: false },
    });
    if (!asignado) {
      res.status(403).json({ mensaje: 'Solo puedes corregir notas de tus cursos y alumnos matriculados' });
      return null;
    }
  }
  return progreso;
}

async function guardarRevision(req, progreso, { nivel, valor, motivo, action = 'ajuste', restauraRevisionId = null }) {
  const antes = valorActualNivel(progreso, nivel);
  const notaAnterior = { ...(progreso.notaAjustada || {}) };
  const motivoFinal = motivo.trim().slice(0, 500);
  progreso.notaAjustada = { ...(progreso.notaAjustada || {}), [nivel]: valor };
  progreso.markModified('notaAjustada');
  const datosRevision = {
      progressId: progreso._id, actorId: req.user.id, action, nivel, antes, despues: valor,
      motivo: motivoFinal, restauraRevisionId,
  };
  const datosAuditoria = { action: `nota.${action}`, entity: 'StudentProgress', entityId: progreso._id,
    affectedUserId: progreso.alumnoId, details: { nivel, antes, despues: valor, motivo: motivoFinal } };

  if (process.env.MONGO_USE_TRANSACTIONS === 'true') {
    const session = await mongoose.startSession();
    try {
      let revision;
      await session.withTransaction(async () => {
        await progreso.save({ session });
        [revision] = await GradeRevision.create([datosRevision], { session });
        datosAuditoria.details.revisionId = String(revision._id);
        await registrarAccion(req, datosAuditoria, { session });
      });
      return revision;
    } catch (error) {
      progreso.notaAjustada = notaAnterior;
      progreso.markModified('notaAjustada');
      throw error;
    } finally {
      await session.endSession().catch(() => {});
    }
  }

  await progreso.save();
  let revision;
  try {
    revision = await GradeRevision.create(datosRevision);
  } catch (error) {
    progreso.notaAjustada = notaAnterior;
    progreso.markModified('notaAjustada');
    await progreso.save();
    throw error;
  }
  try {
    datosAuditoria.details.revisionId = String(revision._id);
    await registrarAccion(req, datosAuditoria);
  } catch (error) { console.error('[auditoría] No se registró el cambio de nota:', error.message); }
  return revision;
}

// Filtros base enviados directamente a MongoDB; los filtros por alumno se aplican con $lookup.
function crearFiltroRegistros({ desde, hasta, lecturaId }) {
  const filtro = {};
  if (desde || hasta) {
    filtro.fecha = {};
    if (desde) filtro.fecha.$gte = new Date(`${desde}T00:00:00`);
    if (hasta) filtro.fecha.$lte = new Date(`${hasta}T23:59:59.999`);
  }
  if (lecturaId) {
    if (!mongoose.isValidObjectId(lecturaId)) throw new Error('El filtro de lectura no es válido');
    filtro.readingId = new mongoose.Types.ObjectId(lecturaId);
  }
  return filtro;
}

function pipelineProgresoFiltrado(query) {
  return [
    { $match: crearFiltroRegistros(query) },
    { $lookup: { from: User.collection.name, localField: 'alumnoId', foreignField: '_id', as: 'alumnoId' } },
    { $unwind: { path: '$alumnoId', preserveNullAndEmptyArrays: true } },
    ...((query.grado || query.seccion) ? [{ $match: {
      'alumnoId.rol': 'alumno',
      ...(query.grado ? { 'alumnoId.grado': query.grado } : {}),
      ...(query.seccion ? { 'alumnoId.seccion': query.seccion } : {}),
    } }] : []),
  ];
}

async function obtenerRegistros(filtros) {
  return StudentProgress.aggregate([
    ...pipelineProgresoFiltrado(filtros),
    { $sort: { fecha: 1, _id: 1 } }, { $limit: 5001 },
    { $lookup: { from: Lectura.collection.name, localField: 'readingId', foreignField: '_id', as: 'lecturaInfo' } },
    { $unwind: { path: '$lecturaInfo', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: Curso.collection.name, localField: 'cursoId', foreignField: '_id', as: 'cursoInfo' } },
    { $unwind: { path: '$cursoInfo', preserveNullAndEmptyArrays: true } },
    { $project: {
      _id: 1, fecha: 1, alumnoId: { nombre: '$alumnoId.nombre', grado: '$alumnoId.grado', seccion: '$alumnoId.seccion' },
      readingId: { titulo: '$lecturaInfo.titulo' }, cursoId: { nombre: '$cursoInfo.nombre', planVersion: '$planVersion' },
      planVersion: 1, respuestasCorrectas: 1, totalPreguntas: 1, porcentajeAciertos: 1, eficienciaTemporal: 1,
      idli: 1, notaAjustada: 1, nivelLiteral: 1, nivelInferencial: 1, nivelCritico: 1,
    } },
  ]).allowDiskUse(true);
}

function pipelineBorradores(query) {
  const filtro = {};
  if (query.lecturaId) {
    if (!mongoose.isValidObjectId(query.lecturaId)) throw new Error('El filtro de lectura no es válido');
    filtro.readingId = new mongoose.Types.ObjectId(query.lecturaId);
  }
  if (query.desde || query.hasta) {
    filtro.updatedAt = {};
    if (query.desde) filtro.updatedAt.$gte = new Date(`${query.desde}T00:00:00`);
    if (query.hasta) filtro.updatedAt.$lte = new Date(`${query.hasta}T23:59:59.999`);
  }
  return [
    { $match: filtro },
    { $lookup: { from: User.collection.name, localField: 'alumnoId', foreignField: '_id', as: 'alumnoId' } },
    { $unwind: '$alumnoId' },
    ...((query.grado || query.seccion) ? [{ $match: {
      ...(query.grado ? { 'alumnoId.grado': query.grado } : {}),
      ...(query.seccion ? { 'alumnoId.seccion': query.seccion } : {}),
    } }] : []),
  ];
}

const presentarBorrador = (b) => ({
  alumno: b.alumnoId?.nombre || 'Alumno', grado: b.alumnoId?.grado || '', seccion: b.alumnoId?.seccion || '',
  lectura: b.readingId?.titulo || 'Sin título', actualizadoEn: b.updatedAt,
  respuestasMarcadas: Object.keys(b.respuestas || {}).length,
  textoLiteral: (b.textoLiteral || '').slice(0, 2000),
  respuestaInferencial: (b.respuestaInferencial || '').slice(0, 2000),
  respuestaCritico: (b.respuestaCritico || '').slice(0, 2000),
  refuerzo: (b.retroalimentacionTexto || '').slice(0, 2000),
  mensajesAsistente: (b.mensajesChat || []).slice(-10).map((m) => ({ emisor: m.emisor, texto: String(m.texto || '').slice(0, 500) })),
  vocabulario: (b.vocabulario || []).slice(0, 30),
  enviado: Boolean(b.enviado),
});

// GET /api/reportes/dashboard?nivel=general|literal|inferencial|critico&desde&hasta&lecturaId&grado&seccion
exports.dashboard = async (req, res) => {
  try {
    const nivel = NIVELES[req.query.nivel] ? req.query.nivel : 'general';
    const filtroProgreso = crearFiltroRegistros({ ...req.query, grado: '', seccion: '' });
    const [dashboard, lecturas, grados, secciones, borradores, totalBorradores] = await Promise.all([
      construirDashboardEnMongo(filtroProgreso, nivel, { grado: req.query.grado, seccion: req.query.seccion }),
      Lectura.find({}, 'titulo').sort({ titulo: 1 }).lean(),
      User.distinct('grado', { rol: 'alumno' }),
      User.distinct('seccion', { rol: 'alumno' }),
      BorradorProgreso.aggregate([
        ...pipelineBorradores(req.query), { $sort: { updatedAt: -1, _id: -1 } }, { $limit: 50 },
        { $lookup: { from: Lectura.collection.name, localField: 'readingId', foreignField: '_id', as: 'readingId' } },
        { $unwind: { path: '$readingId', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 1, updatedAt: 1, alumnoId: { nombre: '$alumnoId.nombre', grado: '$alumnoId.grado', seccion: '$alumnoId.seccion' }, readingId: { titulo: '$readingId.titulo' }, respuestas: 1, textoLiteral: 1, respuestaInferencial: 1, respuestaCritico: 1, retroalimentacionTexto: 1, mensajesChat: 1, vocabulario: 1, enviado: 1 } },
      ]).allowDiskUse(true),
      BorradorProgreso.aggregate([...pipelineBorradores(req.query), { $count: 'cantidad' }]).then((r) => r[0]?.cantidad || 0),
    ]);

    res.json({
      ...dashboard,
      borradores: borradores.map(presentarBorrador),
      totalBorradores,
      hayMasBorradores: borradores.length < totalBorradores,
      opciones: {
        grados: grados.filter(Boolean).sort(),
        secciones: secciones.filter(Boolean).sort(),
        lecturas: lecturas.map((l) => ({ id: l._id, titulo: l.titulo })),
      },
    });
  } catch (error) {
    console.error('Error en reportes/dashboard:', error);
    res.status(500).json({ mensaje: 'Error al generar el dashboard de reportes', error: error.message });
  }
};

exports.listarBorradores = async (req, res) => {
  try {
    const pagina = Math.max(1, Number.parseInt(req.query.pagina, 10) || 1);
    const limite = Math.min(100, Math.max(1, Number.parseInt(req.query.limite, 10) || 50));
    const [borradores, conteo] = await Promise.all([
      BorradorProgreso.aggregate([
        ...pipelineBorradores(req.query), { $sort: { updatedAt: -1, _id: -1 } },
        { $skip: (pagina - 1) * limite }, { $limit: limite },
        { $lookup: { from: Lectura.collection.name, localField: 'readingId', foreignField: '_id', as: 'readingId' } },
        { $unwind: { path: '$readingId', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 1, updatedAt: 1, alumnoId: { nombre: '$alumnoId.nombre', grado: '$alumnoId.grado', seccion: '$alumnoId.seccion' }, readingId: { titulo: '$readingId.titulo' }, respuestas: 1, textoLiteral: 1, respuestaInferencial: 1, respuestaCritico: 1, retroalimentacionTexto: 1, mensajesChat: 1, vocabulario: 1, enviado: 1 } },
      ]).allowDiskUse(true),
      BorradorProgreso.aggregate([...pipelineBorradores(req.query), { $count: 'cantidad' }]).then((r) => r[0]?.cantidad || 0),
    ]);
    res.json({ pagina, limite, total: conteo, hayMas: pagina * limite < conteo, borradores: borradores.map(presentarBorrador) });
  } catch (error) {
    console.error('Error al listar borradores paginados:', error);
    res.status(500).json({ mensaje: 'No se pudieron cargar los avances de los alumnos' });
  }
};

// GET /api/reportes/ficha-observacion?desde&hasta&lecturaId&grado&seccion  ->  .xlsx
exports.fichaObservacion = async (req, res) => {
  try {
    const [registros, borradores] = await Promise.all([
      obtenerRegistros(req.query),
      BorradorProgreso.aggregate([
        ...pipelineBorradores(req.query), { $sort: { updatedAt: -1, _id: -1 } }, { $limit: 5001 },
        { $lookup: { from: Lectura.collection.name, localField: 'readingId', foreignField: '_id', as: 'readingId' } },
        { $unwind: { path: '$readingId', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 1, updatedAt: 1, alumnoId: { nombre: '$alumnoId.nombre', grado: '$alumnoId.grado', seccion: '$alumnoId.seccion' }, readingId: { titulo: '$readingId.titulo' }, respuestas: 1, textoLiteral: 1, respuestaInferencial: 1, respuestaCritico: 1, retroalimentacionTexto: 1, mensajesChat: 1, vocabulario: 1, enviado: 1 } },
      ]).allowDiskUse(true),
    ]);
    if (registros.length + borradores.length > 5000) {
      return res.status(413).json({ mensaje: 'La exportación supera 5,000 registros. Filtra por periodo, grado, sección o lectura para descargarla en partes.' });
    }
    if (!registros.length && !borradores.length) {
      return res.status(404).json({ mensaje: 'No hay registros para exportar con los filtros seleccionados' });
    }
    const docente = await User.findById(req.user.id, 'nombre').lean();
    const wb = construirFicha({
      registros,
      borradores,
      docente: docente?.nombre,
      filtros: {
        ...req.query,
        lecturaTitulo: req.query.lecturaId ? (registros[0]?.readingId || borradores[0]?.readingId)?.titulo : '',
      },
    });

    const hoy = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="ficha_observacion_${hoy}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error en reportes/ficha-observacion:', error);
    res.status(500).json({ mensaje: 'Error al generar la ficha de observación', error: error.message });
  }
};

// GET /api/reportes/notas · registros con la nota efectiva y sus niveles.
exports.listarNotas = async (req, res) => {
  try {
    const pagina = Math.max(1, Number.parseInt(req.query.pagina, 10) || 1);
    const limite = Math.min(100, Math.max(1, Number.parseInt(req.query.limite, 10) || 50));
    const [registros, total] = await Promise.all([
      StudentProgress.aggregate([
        ...pipelineProgresoFiltrado(req.query), { $sort: { fecha: -1, _id: -1 } },
        { $skip: (pagina - 1) * limite }, { $limit: limite },
        { $lookup: { from: Lectura.collection.name, localField: 'readingId', foreignField: '_id', as: 'lecturaInfo' } },
        { $unwind: { path: '$lecturaInfo', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: Curso.collection.name, localField: 'cursoId', foreignField: '_id', as: 'cursoInfo' } },
        { $unwind: { path: '$cursoInfo', preserveNullAndEmptyArrays: true } },
        { $project: {
          _id: 1, fecha: 1, alumno: { nombre: '$alumnoId.nombre', grado: '$alumnoId.grado', seccion: '$alumnoId.seccion' },
          lectura: { titulo: '$lecturaInfo.titulo' }, curso: { nombre: '$cursoInfo.nombre' }, actividadId: 1, planVersion: 1,
          respuestasCorrectas: 1, totalPreguntas: 1, porcentajeAciertos: 1, eficienciaTemporal: 1,
          idli: 1, notaAjustada: 1, nivelLiteral: 1, nivelInferencial: 1, nivelCritico: 1,
        } },
      ]).allowDiskUse(true),
      StudentProgress.aggregate([...pipelineProgresoFiltrado(req.query), { $count: 'cantidad' }]).then((r) => r[0]?.cantidad || 0),
    ]);
    res.json({ pagina, limite, total, hayMas: pagina * limite < total, registros: registros.map((progreso) => ({
      _id: progreso._id, fecha: progreso.fecha, alumno: progreso.alumno, lectura: progreso.lectura,
      curso: progreso.curso, actividadId: progreso.actividadId, planVersion: progreso.planVersion,
      valores: Object.fromEntries(VALORES_NIVEL.map((nivel) => [nivel, valorActualNivel(progreso, nivel)])),
      respuestasCorrectas: progreso.respuestasCorrectas, totalPreguntas: progreso.totalPreguntas,
    })) });
  } catch (error) {
    console.error('Error al listar notas:', error);
    res.status(500).json({ mensaje: 'No se pudieron listar las notas' });
  }
};

exports.historialNota = async (req, res) => {
  try {
    const progreso = await progresoGestionable(req, res);
    if (!progreso) return;
    const historial = await GradeRevision.find({ progressId: progreso._id })
      .populate('actorId', 'nombre apellido email').sort({ createdAt: -1 }).limit(100).lean();
    res.json({ valores: Object.fromEntries(VALORES_NIVEL.map((nivel) => [nivel, valorActualNivel(progreso, nivel)])), historial });
  } catch (error) {
    console.error('Error al consultar historial de nota:', error);
    res.status(500).json({ mensaje: 'No se pudo consultar el historial de la nota' });
  }
};

exports.ajustarNota = async (req, res) => {
  try {
    const progreso = await progresoGestionable(req, res);
    if (!progreso) return;
    const { nivel, valor, motivo } = req.body || {};
    const nota = Number(valor);
    if (!VALORES_NIVEL.includes(nivel) || !Number.isFinite(nota) || nota < 0 || nota > 100
      || typeof motivo !== 'string' || !motivo.trim()) {
      return res.status(400).json({ mensaje: 'Indica un nivel, un puntaje de 0 a 100 y el motivo del ajuste' });
    }
    const revision = await guardarRevision(req, progreso, { nivel, valor: Math.round(nota * 100) / 100, motivo });
    res.json({ mensaje: 'Ajuste guardado en el historial', revision });
  } catch (error) {
    console.error('Error al ajustar nota:', error);
    res.status(500).json({ mensaje: 'No se pudo ajustar la nota' });
  }
};

exports.restaurarNota = async (req, res) => {
  try {
    const progreso = await progresoGestionable(req, res);
    if (!progreso) return;
    if (!mongoose.isValidObjectId(req.params.revisionId)) return res.status(400).json({ mensaje: 'Identificador de revisión no válido' });
    const revisionObjetivo = await GradeRevision.findOne({ _id: req.params.revisionId, progressId: progreso._id });
    if (!revisionObjetivo) return res.status(404).json({ mensaje: 'No se encontró esa revisión de nota' });
    const lado = req.body?.lado === 'antes' ? 'antes' : 'despues';
    const valor = lado === 'antes' ? revisionObjetivo.antes : revisionObjetivo.despues;
    if (!Number.isFinite(valor)) return res.status(400).json({ mensaje: 'Esa revisión no contiene un puntaje recuperable' });
    const motivo = typeof req.body?.motivo === 'string' && req.body.motivo.trim()
      ? req.body.motivo : `Restauración del valor ${lado} de la revisión ${revisionObjetivo._id}`;
    const revision = await guardarRevision(req, progreso, {
      nivel: revisionObjetivo.nivel, valor, motivo,
      action: 'restauracion', restauraRevisionId: revisionObjetivo._id,
    });
    res.json({ mensaje: `Se restauró el puntaje ${valor} del nivel ${revisionObjetivo.nivel}`, revision });
  } catch (error) {
    console.error('Error al restaurar nota:', error);
    res.status(500).json({ mensaje: 'No se pudo restaurar esa revisión' });
  }
};
