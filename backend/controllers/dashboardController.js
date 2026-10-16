const mongoose = require('mongoose');
const StudentProgress = require('../models/StudentProgress');
const User = require('../models/User');
const Curso = require('../models/Curso');
const Lectura = require('../models/Lectura');

function aplicarNotaAjustada(progreso) {
  const a = progreso.notaAjustada || {};
  if (Number.isFinite(a.general)) progreso.idli = a.general;
  if (Number.isFinite(a.literal)) progreso.nivelLiteral = { ...progreso.nivelLiteral, inflesz: a.literal };
  if (Number.isFinite(a.inferencial)) progreso.nivelInferencial = { ...progreso.nivelInferencial, rougeL: a.inferencial / 100 };
  if (Number.isFinite(a.critico)) progreso.nivelCritico = { ...progreso.nivelCritico, rougeS: a.critico / 100 };
  return progreso;
}
const AuditLog = require('../models/AuditLog');
const { huellaValida } = require('../utils/auditoria');

async function alcanceProgreso(req) {
  if (String(req.user?.rol || '').toLowerCase() === 'admin') return null;
  const cursos = await Curso.find({ docente: req.user.id, activo: { $ne: false } }).select('_id alumnos').lean();
  return {
    cursos: cursos.map((curso) => curso._id),
    alumnos: [...new Set(cursos.flatMap((curso) => curso.alumnos || []).map(String))],
  };
}

exports.resumenAdmin = async (req, res) => {
  try {
    const [usuarios, cursos, lecturas, intentos, recientes, usuariosRecientes] = await Promise.all([
      User.aggregate([{ $match: { activo: { $ne: false } } }, { $group: { _id: '$rol', total: { $sum: 1 } } }]),
      Curso.countDocuments({ activo: { $ne: false } }),
      Lectura.countDocuments(),
      StudentProgress.countDocuments(),
      StudentProgress.find().select('fecha porcentajeAciertos eficienciaTemporal idli alumnoId readingId')
        .populate('alumnoId', 'nombre apellido email').populate('readingId', 'titulo')
        .sort({ fecha: -1 }).limit(10).lean(),
      User.find({ activo: { $ne: false } }).select('nombre apellido email rol createdAt')
        .sort({ createdAt: -1 }).limit(8).lean(),
    ]);
    const usuariosPorRol = Object.fromEntries(usuarios.map(({ _id, total }) => [_id, total]));
    res.json({ totales: {
      usuarios: Object.values(usuariosPorRol).reduce((a, n) => a + n, 0),
      alumnos: usuariosPorRol.alumno || 0,
      docentes: usuariosPorRol.docente || 0,
      administradores: usuariosPorRol.admin || 0,
      cursos, lecturas, intentos,
    }, actividadReciente: recientes, usuariosRecientes });
  } catch (error) {
    console.error('Error en dashboard admin:', error);
    res.status(500).json({ mensaje: 'Error al obtener el resumen del administrador' });
  }
};

// Historial paginado para no cargar la auditoría completa en el dashboard.
exports.listarAccionesAdmin = async (req, res) => {
  try {
    const pagina = Math.max(1, Number.parseInt(req.query.pagina, 10) || 1);
    const limite = Math.min(100, Math.max(1, Number.parseInt(req.query.limite, 10) || 50));
    const filtro = {};
    if (req.query.accion) filtro.action = String(req.query.accion).slice(0, 100);
    const usuarioQuery = String(req.query.usuario || '').trim().slice(0, 120);
    if (usuarioQuery) {
      const escapado = usuarioQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const coincidencias = await User.find({
        $or: [
          { email: new RegExp(escapado, 'i') },
          { nombre: new RegExp(escapado, 'i') },
          { apellido: new RegExp(escapado, 'i') },
        ],
      }).select('_id').limit(500).lean();
      const ids = coincidencias.map((u) => u._id);
      if (mongoose.isValidObjectId(usuarioQuery)) ids.push(new mongoose.Types.ObjectId(usuarioQuery));
      filtro.$or = ids.length
        ? [{ actorId: { $in: ids } }, { affectedUserId: { $in: ids } }]
        : [{ actorId: null, affectedUserId: null }];
    }
    const [eventos, total] = await Promise.all([
      AuditLog.find(filtro).populate('actorId', 'nombre apellido email')
        .populate('affectedUserId', 'nombre apellido email')
        .sort({ createdAt: -1, _id: -1 }).skip((pagina - 1) * limite).limit(limite).lean(),
      AuditLog.countDocuments(filtro),
    ]);
    const acciones = eventos.map((evento) => ({ ...evento, integridadValida: huellaValida(evento) }));
    res.json({ acciones, pagina, limite, total, hayMas: pagina * limite < total });
  } catch (error) {
    console.error('Error al listar auditoría paginada:', error);
    res.status(500).json({ mensaje: 'No se pudo cargar el historial de acciones' });
  }
};

exports.resumenGlobal = async (req, res) => {
  try {
    const alcance = await alcanceProgreso(req);
    if (alcance && alcance.cursos.length === 0) return res.json({ totalRegistros: 0, promedioPA: 0, promedioETR: 0, promedioIDLI: 0, promedioInflesz: 0, promedioRougeL: 0, promedioRougeS: 0 });
    const resultado = await StudentProgress.aggregate([
      ...(alcance ? [{ $match: { cursoId: { $in: alcance.cursos } } }] : []),
      { $group: {
          _id: null,
          totalRegistros: { $sum: 1 },
          promedioPA: { $avg: '$porcentajeAciertos' },
          promedioETR: { $avg: '$eficienciaTemporal' },
          promedioIDLI: { $avg: { $ifNull: ['$notaAjustada.general', '$idli'] } },
          promedioInflesz: { $avg: { $ifNull: ['$notaAjustada.literal', '$nivelLiteral.inflesz'] } },
          promedioRougeL: { $avg: { $divide: [{ $ifNull: ['$notaAjustada.inferencial', { $multiply: ['$nivelInferencial.rougeL', 100] }] }, 100] } },
          promedioRougeS: { $avg: { $divide: [{ $ifNull: ['$notaAjustada.critico', { $multiply: ['$nivelCritico.rougeS', 100] }] }, 100] } },
      }},
      { $project: { _id: 0 } },
    ]);
    res.json(resultado[0] || { totalRegistros: 0, promedioPA: 0, promedioETR: 0, promedioIDLI: 0, promedioInflesz: 0, promedioRougeL: 0, promedioRougeS: 0 });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener el resumen global', error: error.message });
  }
};

exports.resumenPorLectura = async (req, res) => {
  try {
    const alcance = await alcanceProgreso(req);
    if (alcance && alcance.cursos.length === 0) return res.json([]);
    const resultado = await StudentProgress.aggregate([
      ...(alcance ? [{ $match: { cursoId: { $in: alcance.cursos } } }] : []),
      { $group: {
          _id: '$readingId',
          totalIntentos: { $sum: 1 },
          promedioPA: { $avg: '$porcentajeAciertos' },
          promedioETR: { $avg: '$eficienciaTemporal' },
          promedioIDLI: { $avg: { $ifNull: ['$notaAjustada.general', '$idli'] } },
          promedioInflesz: { $avg: { $ifNull: ['$notaAjustada.literal', '$nivelLiteral.inflesz'] } },
          promedioRougeL: { $avg: { $divide: [{ $ifNull: ['$notaAjustada.inferencial', { $multiply: ['$nivelInferencial.rougeL', 100] }] }, 100] } },
          promedioRougeS: { $avg: { $divide: [{ $ifNull: ['$notaAjustada.critico', { $multiply: ['$nivelCritico.rougeS', 100] }] }, 100] } },
      }},
      { $lookup: { from: 'lecturas', localField: '_id', foreignField: '_id', as: 'lectura' } },
      { $unwind: { path: '$lectura', preserveNullAndEmptyArrays: true } },
      { $project: {
          readingId: '$_id', _id: 0, tituloLectura: '$lectura.titulo',
          totalIntentos: 1, promedioPA: 1, promedioETR: 1, promedioIDLI: 1,
          promedioInflesz: 1, promedioRougeL: 1, promedioRougeS: 1,
      }},
      { $sort: { tituloLectura: 1 } },
    ]);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener el resumen por lectura', error: error.message });
  }
};

exports.resumenPorAlumno = async (req, res) => {
  try {
    const { alumnoId } = req.params;
    const alcance = await alcanceProgreso(req);
    if (alcance && (!alcance.alumnos.includes(String(alumnoId)) || !alcance.cursos.length)) {
      return res.status(403).json({ mensaje: 'No tienes acceso al progreso de este alumno' });
    }
    const historial = await StudentProgress.find({ alumnoId, ...(alcance ? { cursoId: { $in: alcance.cursos } } : {}) })
      .populate('readingId', 'titulo')
      .sort({ fecha: -1 });
    res.json(historial.map((item) => { const p = item.toObject(); return aplicarNotaAjustada(p); }));
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener el historial del alumno', error: error.message });
  }
};

exports.listarTodos = async (req, res) => {
  try {
    const alcance = await alcanceProgreso(req);
    if (alcance && !alcance.cursos.length) return res.json([]);
    const registros = await StudentProgress.find(alcance ? { cursoId: { $in: alcance.cursos } } : {})
      .populate('alumnoId', 'nombre email')
      .populate('readingId', 'titulo')
      .sort({ fecha: -1 });
    res.json(registros.map(aplicarNotaAjustada));
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al listar los registros', error: error.message });
  }
};
