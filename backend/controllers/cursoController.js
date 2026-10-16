const mongoose = require('mongoose');
const Curso = require('../models/Curso');
const User = require('../models/User');
const Lectura = require('../models/Lectura');
const CursoPlanVersion = require('../models/CursoPlanVersion');
const ActivitySubmission = require('../models/ActivitySubmission');
const StudentProgress = require('../models/StudentProgress');
const { estadosRutaAprendizaje, comprobarAccesoActividad } = require('../utils/rutaAprendizaje');
const { registrarAccion } = require('../utils/auditoria');
const { GoogleGenAI } = require('@google/genai');
const { MODELOS } = require('../ia/gemini');

const rolDe = (req) => (req.user?.rol || '').toLowerCase();
const esAdmin = (req) => rolDe(req) === 'admin';
const esAlumno = (req) => ['alumno', 'estudiante'].includes(rolDe(req));
const idValido = (id) => mongoose.isValidObjectId(id);

// Solo alumnos activos: si un usuario se elimina (activo=false) deja de aparecer en el curso.
const ALUMNOS_ACTIVOS = {
  path: 'alumnos',
  match: { activo: { $ne: false } },
  select: 'nombre apellido email dni rol grado seccion',
};

function validarCurso(body) {
  const competencias = Array.isArray(body.competencias)
    ? body.competencias.map((v) => String(v).trim().slice(0, 300)).filter(Boolean).slice(0, 30)
    : String(body.competencias || '').split(/[\n,;]/).map((v) => v.trim().slice(0, 300)).filter(Boolean).slice(0, 30);
  const datos = {
    nombre: (body.nombre || '').trim(),
    grado: (body.grado || '').trim(),
    seccion: (body.seccion || '').trim().toUpperCase(),
    descripcion: (body.descripcion || '').trim().slice(0, 500),
    institucion: String(body.institucion || '').trim().slice(0, 180),
    areaCurricular: String(body.areaCurricular || '').trim().slice(0, 120),
    referenciaCurricular: String(body.referenciaCurricular || '').trim().slice(0, 300),
    competencias,
    programacionCurricular: String(body.programacionCurricular || '').trim().slice(0, 8000),
  };
  if (!datos.nombre || !datos.grado || !datos.seccion) {
    return { error: 'Completa el nombre, el grado y la sección del curso' };
  }
  if (datos.nombre.length > 120) return { error: 'El nombre del curso es demasiado largo' };
  return { datos };
}

// Devuelve el curso si existe y el usuario puede gestionarlo (su docente o un admin).
// Si no, ya respondió con el error y devuelve null.
async function cursoGestionable(req, res) {
  if (!idValido(req.params.id)) {
    res.status(400).json({ message: 'Identificador de curso inválido' });
    return null;
  }
  const curso = await Curso.findOne({ _id: req.params.id, activo: { $ne: false } });
  if (!curso) {
    res.status(404).json({ message: 'Curso no encontrado' });
    return null;
  }
  if (!esAdmin(req) && String(curso.docente) !== String(req.user.id)) {
    res.status(403).json({ message: 'Este curso pertenece a otro docente' });
    return null;
  }
  return curso;
}

// ───────────── Helpers de acceso / vista ─────────────
const POPULAR_LECTURA = { path: 'sesiones.actividades.lectura', select: 'titulo tipo tiempoEstimado estado pdfUrl nombreArchivo' };
const esMatriculado = (curso, userId) => curso.alumnos.some((a) => String(a) === String(userId));

// Carga el curso y valida que el usuario pueda VERLO:
//  - alumno: solo si está matriculado
//  - docente: solo el suyo; admin: cualquiera
async function cursoVisible(req, res) {
  if (!idValido(req.params.id)) {
    res.status(400).json({ message: 'Identificador de curso inválido' });
    return null;
  }
  const curso = await Curso.findOne({ _id: req.params.id, activo: { $ne: false } });
  if (!curso) {
    res.status(404).json({ message: 'Curso no encontrado' });
    return null;
  }
  if (esAlumno(req)) {
    if (!esMatriculado(curso, req.user.id)) {
      res.status(403).json({ message: 'No estás matriculado en este curso' });
      return null;
    }
  } else if (!esAdmin(req) && String(curso.docente) !== String(req.user.id)) {
    res.status(403).json({ message: 'Este curso pertenece a otro docente' });
    return null;
  }
  return curso;
}

// Arma la respuesta del curso según quién lo mira.
// El alumno NO recibe la lista de compañeros, ni sesiones/actividades ocultas, ni actividades sin lectura publicada.
async function vistaCurso(req, id) {
  const curso = await Curso.findById(id).populate(POPULAR_LECTURA).populate('docente', 'nombre apellido');
  const alumno = esAlumno(req);
  const docentePropietario = ['docente', 'profesor'].includes(rolDe(req)) && String(curso.docente?._id || curso.docente) === String(req.user.id);
  if (!alumno) await curso.populate(ALUMNOS_ACTIVOS);
  const obj = curso.toObject();

  if (alumno) {
    delete obj.alumnos;
    const estadosRuta = await estadosRutaAprendizaje(curso, req.user.id);
    obj.sesiones = (obj.sesiones || [])
      .filter((s) => s.visible !== false)
      .map((s) => ({
        ...s,
        actividades: (s.actividades || []).filter(
          (a) => a.visible !== false && a.lectura && !['Archivado', 'Borrador'].includes(a.lectura.estado)
        ).map((a) => {
          // Las rúbricas son material privado del docente, incluso si el alumno
          // consulta directamente la respuesta de la API.
          const { rubrica, ...actividad } = a;
          return { ...actividad, rutaAprendizaje: estadosRuta.get(String(a._id)) || null };
        }),
      }));
  }
  if (!docentePropietario) {
    obj.sesiones = (obj.sesiones || []).map((s) => ({
      ...s, actividades: (s.actividades || []).map(({ rubrica, ...actividad }) => actividad),
    }));
  }
  obj.puedeEditar = !alumno;
  obj.puedeVerRubrica = docentePropietario;
  return obj;
}

// GET /api/cursos
// Docente: sus cursos. Admin: todos. Alumno: solo aquellos donde está matriculado.
// Devuelve el total de alumnos, no la lista (para no exponer a los compañeros).
exports.listar = async (req, res) => {
  try {
    const alumno = esAlumno(req);
    const filtro = { activo: { $ne: false } };
    if (alumno) filtro.alumnos = req.user.id;
    else if (!esAdmin(req)) filtro.docente = req.user.id;

    const cursos = await Curso.find(filtro)
      .populate({ path: 'alumnos', match: { activo: { $ne: false } }, select: '_id' })
      .populate('docente', 'nombre apellido')
      .sort({ createdAt: -1 })
      .lean();

    res.json(cursos.map(({ alumnos, sesiones = [], ...resto }) => {
      const ses = alumno ? sesiones.filter((s) => s.visible !== false) : sesiones;
      const totalActividades = ses.reduce(
        (n, s) => n + (s.actividades || []).filter((a) => !alumno || a.visible !== false).length, 0);
      return { ...resto, totalAlumnos: alumnos.length, totalSesiones: ses.length, totalActividades };
    }));
  } catch (error) {
    console.error('Error en listar cursos:', error);
    res.status(500).json({ message: 'Error al listar los cursos' });
  }
};

// GET /api/cursos/:id → curso con sesiones/actividades (y alumnos solo para el docente/admin)
exports.obtener = async (req, res) => {
  try {
    const curso = await cursoVisible(req, res);
    if (!curso) return;
    res.json(await vistaCurso(req, curso._id));
  } catch (error) {
    console.error('Error en obtener curso:', error);
    res.status(500).json({ message: 'Error al obtener el curso' });
  }
};

exports.historialPlan = async (req, res) => {
  try {
    const curso = await cursoGestionable(req, res);
    if (!curso) return;
    const versiones = await CursoPlanVersion.find({ cursoId: curso._id })
      .populate('actorId', 'nombre apellido email').sort({ version: -1 }).limit(100).lean();
    res.json({ versionActual: curso.planVersion || 1, versiones });
  } catch (error) {
    console.error('Error al consultar el historial del plan:', error);
    res.status(500).json({ message: 'No se pudo consultar el historial del plan' });
  }
};

exports.restaurarPlan = async (req, res) => {
  try {
    const curso = await cursoGestionable(req, res);
    if (!curso) return;
    const version = Number(req.params.version);
    if (!Number.isInteger(version) || version < 1) return res.status(400).json({ message: 'La versión indicada no es válida' });
    const anterior = await CursoPlanVersion.findOne({ cursoId: curso._id, version }).lean();
    if (!anterior) return res.status(404).json({ message: 'No se encontró esa versión de la planificación' });

    Object.assign(curso, {
      nombre: anterior.snapshot.nombre,
      descripcion: anterior.snapshot.descripcion || '',
      institucion: anterior.snapshot.institucion || '',
      areaCurricular: anterior.snapshot.areaCurricular || '',
      referenciaCurricular: anterior.snapshot.referenciaCurricular || '',
      competencias: anterior.snapshot.competencias || [],
      programacionCurricular: anterior.snapshot.programacionCurricular || '',
      grado: anterior.snapshot.grado,
      seccion: anterior.snapshot.seccion,
      sesiones: anterior.snapshot.sesiones || [],
    });
    await curso.save();
    if (req.io) req.io.emit('curso-actualizado', { cursoId: curso._id });
    res.json({ message: `Se restauró el contenido de la versión ${version}`, curso: await vistaCurso(req, curso._id) });
  } catch (error) {
    console.error('Error al restaurar la planificación:', error);
    res.status(500).json({ message: 'No se pudo restaurar esa versión del plan' });
  }
};

// POST /api/cursos   body: { nombre, grado, seccion }
exports.crear = async (req, res) => {
  try {
    const { error, datos } = validarCurso(req.body);
    if (error) return res.status(400).json({ message: error });

    const repetido = await Curso.findOne({ nombre: datos.nombre, grado: datos.grado, seccion: datos.seccion, docente: req.user.id, activo: { $ne: false } });
    if (repetido) return res.status(400).json({ message: 'Ya tienes un curso con ese nombre, grado y sección' });

    const curso = await Curso.create({ ...datos, docente: req.user.id, alumnos: [] });
    await registrarAccion(req, { action: 'curso.creado', entity: 'Curso', entityId: curso._id, details: { nombre: curso.nombre, grado: curso.grado, seccion: curso.seccion } });
    res.status(201).json(curso);
  } catch (error) {
    console.error('Error en crear curso:', error);
    res.status(500).json({ message: 'Error al crear el curso' });
  }
};

// PUT /api/cursos/:id   body: { nombre, grado, seccion }
exports.actualizar = async (req, res) => {
  try {
    const curso = await cursoGestionable(req, res);
    if (!curso) return;
    const { error, datos } = validarCurso(req.body);
    if (error) return res.status(400).json({ message: error });

    const repetido = await Curso.findOne({ nombre: datos.nombre, grado: datos.grado, seccion: datos.seccion, docente: curso.docente, activo: { $ne: false }, _id: { $ne: curso._id } });
    if (repetido) return res.status(400).json({ message: 'Ya existe un curso con ese nombre, grado y sección' });

    Object.assign(curso, datos);
    await curso.save();
    res.json(curso);
  } catch (error) {
    console.error('Error en actualizar curso:', error);
    res.status(500).json({ message: 'Error al actualizar el curso' });
  }
};

// DELETE /api/cursos/:id → eliminación lógica. Los alumnos NO se borran, solo dejan de estar en el curso.
exports.eliminar = async (req, res) => {
  try {
    const curso = await cursoGestionable(req, res);
    if (!curso) return;
    curso.activo = false;
    await curso.save();
    res.json({ message: 'Curso eliminado' });
  } catch (error) {
    console.error('Error en eliminar curso:', error);
    res.status(500).json({ message: 'Error al eliminar el curso' });
  }
};

// POST /api/cursos/:id/matricular
// body: { alumnos: [id, id, ...] }  o  { seccionCompleta: true } (todos los alumnos con el grado y sección del curso)
// Es idempotente: matricular dos veces al mismo alumno no lo duplica.
exports.matricular = async (req, res) => {
  try {
    const curso = await cursoGestionable(req, res);
    if (!curso) return;

    let candidatos;
    if (req.body.seccionCompleta) {
      candidatos = await User.find({
        rol: 'alumno', activo: { $ne: false }, grado: curso.grado, seccion: curso.seccion,
      }).select('_id');
    } else {
      const pedidos = Array.isArray(req.body.alumnos) ? req.body.alumnos.filter(idValido) : [];
      if (pedidos.length === 0) {
        return res.status(400).json({ message: 'Selecciona al menos un alumno' });
      }
      // Solo cuentan alumnos reales y activos (no se puede matricular a un docente ni a un usuario eliminado).
      candidatos = await User.find({ _id: { $in: pedidos }, rol: 'alumno', activo: { $ne: false } }).select('_id');
    }

    const yaEstan = new Set(curso.alumnos.map(String));
    const nuevos = candidatos.map((u) => u._id).filter((id) => !yaEstan.has(String(id)));

    if (nuevos.length > 0) {
      await Curso.updateOne({ _id: curso._id }, { $addToSet: { alumnos: { $each: nuevos } } });
    }

    const omitidos = candidatos.length - nuevos.length;
    let message;
    if (nuevos.length === 0) {
      message = candidatos.length === 0
        ? 'No se encontraron alumnos para matricular'
        : 'Los alumnos seleccionados ya estaban matriculados';
    } else {
      message = `${nuevos.length} alumno(s) matriculado(s) en el curso`;
      if (omitidos > 0) message += ` (${omitidos} ya estaban matriculados)`;
    }
    if (nuevos.length) await registrarAccion(req, { action: 'curso.alumnos.matriculados', entity: 'Curso', entityId: curso._id, details: { cantidad: nuevos.length, alumnos: nuevos.map(String) } });
    res.json({ message, matriculados: nuevos.length, yaEstaban: omitidos });
  } catch (error) {
    console.error('Error en matricular:', error);
    res.status(500).json({ message: 'Error al matricular a los alumnos' });
  }
};

// DELETE /api/cursos/:id/alumnos/:alumnoId → retira al alumno del curso (la cuenta sigue activa)
exports.desmatricular = async (req, res) => {
  try {
    const curso = await cursoGestionable(req, res);
    if (!curso) return;
    if (!idValido(req.params.alumnoId)) {
      return res.status(400).json({ message: 'Identificador de alumno inválido' });
    }
    const actualizado = await Curso.updateOne({ _id: curso._id, alumnos: req.params.alumnoId }, { $pull: { alumnos: req.params.alumnoId } });
    if (actualizado.modifiedCount) await registrarAccion(req, { action: 'curso.alumno.retirado', entity: 'Curso', entityId: curso._id, affectedUserId: req.params.alumnoId });
    res.json({ message: 'Alumno retirado del curso' });
  } catch (error) {
    console.error('Error en desmatricular:', error);
    res.status(500).json({ message: 'Error al retirar al alumno del curso' });
  }
};

// ───────────── Sesiones y actividades ─────────────
const limpiarRubrica = (r) => ({
  criterios: (Array.isArray(r?.criterios) ? r.criterios : [])
    .map((c) => ({
      codigo: String(c?.codigo || '').trim().slice(0, 40),
      nombre: String(c?.nombre || '').trim().slice(0, 150),
      objetivo: String(c?.objetivo || '').trim().slice(0, 300),
      niveles: (Array.isArray(c?.niveles) ? c.niveles : [])
        .map((n) => ({
          nombre: String(n?.nombre || '').trim().slice(0, 60),
          puntos: Math.max(0, Number(n?.puntos) || 0),
          descriptor: String(n?.descriptor || '').trim().slice(0, 400),
        }))
        .filter((n) => n.nombre),
    }))
    .filter((c) => c.nombre && c.niveles.length),
});

// Fecha vacía → null; fecha inválida → undefined (para rechazarla)
const leerFecha = (f) => {
  if (f === '' || f === null) return null;
  const d = new Date(f);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const buscarSesion = (curso, res, sid) => {
  const sesion = idValido(sid) ? curso.sesiones.id(sid) : null;
  if (!sesion) res.status(404).json({ message: 'Sesión no encontrada' });
  return sesion;
};

const responderCurso = async (req, res, curso, status = 200) => {
  await curso.save();
  res.status(status).json(await vistaCurso(req, curso._id));
};

// POST /api/cursos/:id/sesiones   body: { titulo, temas }
exports.crearSesion = async (req, res) => {
  try {
    const curso = await cursoGestionable(req, res);
    if (!curso) return;
    const titulo = String(req.body.titulo || '').trim();
    if (!titulo) return res.status(400).json({ message: 'Escribe el título de la sesión' });
    const fechaProgramada = leerFecha(req.body.fechaProgramada === undefined ? null : req.body.fechaProgramada);
    if (fechaProgramada === undefined) return res.status(400).json({ message: 'La fecha y hora de la sesión no son válidas' });
    curso.sesiones.push({ titulo: titulo.slice(0, 150), temas: String(req.body.temas || '').trim().slice(0, 1000), objetivoAprendizaje: String(req.body.objetivoAprendizaje || '').trim().slice(0, 500), fechaProgramada });

    // NOTIFICACIÓN: Avisar a los alumnos que el curso ha cambiado
    if (req.io) {
      req.io.emit('curso-actualizado', { cursoId: curso._id });
    }

    await responderCurso(req, res, curso, 201);
  } catch (error) {
    console.error('Error en crearSesion:', error);
    res.status(500).json({ message: 'Error al crear la sesión' });
  }
};

// PUT /api/cursos/:id/sesiones/:sid   body: { titulo?, temas?, visible? }
exports.actualizarSesion = async (req, res) => {
  try {
    const curso = await cursoGestionable(req, res);
    if (!curso) return;
    const sesion = buscarSesion(curso, res, req.params.sid);
    if (!sesion) return;

    if (req.body.titulo !== undefined) {
      const titulo = String(req.body.titulo).trim();
      if (!titulo) return res.status(400).json({ message: 'El título de la sesión no puede estar vacío' });
      sesion.titulo = titulo.slice(0, 150);
    }
    if (req.body.temas !== undefined) sesion.temas = String(req.body.temas).trim().slice(0, 1000);
    if (req.body.objetivoAprendizaje !== undefined) sesion.objetivoAprendizaje = String(req.body.objetivoAprendizaje).trim().slice(0, 500);
    if (req.body.fechaProgramada !== undefined) {
      const fecha = leerFecha(req.body.fechaProgramada);
      if (fecha === undefined) return res.status(400).json({ message: 'La fecha y hora de la sesión no son válidas' });
      sesion.fechaProgramada = fecha;
    }
    if (req.body.visible !== undefined) sesion.visible = !!req.body.visible;

    // NOTIFICACIÓN: Avisar que la sesión cambió (ej: se volvió visible)
    if (req.io) {
      req.io.emit('curso-actualizado', { cursoId: curso._id });
    }

    await responderCurso(req, res, curso);
  } catch (error) {
    console.error('Error en actualizarSesion:', error);
    res.status(500).json({ message: 'Error al actualizar la sesión' });
  }
};

// DELETE /api/cursos/:id/sesiones/:sid
exports.eliminarSesion = async (req, res) => {
  try {
    const curso = await cursoGestionable(req, res);
    if (!curso) return;
    if (!buscarSesion(curso, res, req.params.sid)) return;
    curso.sesiones.pull(req.params.sid);

    // NOTIFICACIÓN
    if (req.io) {
      req.io.emit('curso-actualizado', { cursoId: curso._id });
    }

    await responderCurso(req, res, curso);
  } catch (error) {
    console.error('Error en eliminarSesion:', error);
    res.status(500).json({ message: 'Error al eliminar la sesión' });
  }
};

// POST /api/cursos/:id/sesiones/:sid/actividades
// body: { lectura, titulo?, instrucciones?, fechaEntrega?, visible?, rubrica? }
exports.crearActividad = async (req, res) => {
  try {
    const curso = await cursoGestionable(req, res);
    if (!curso) return;
    const sesion = buscarSesion(curso, res, req.params.sid);
    if (!sesion) return;

    const { lectura, titulo, instrucciones, fechaEntrega, visible, rubrica } = req.body;
    if (rubrica !== undefined && !(['docente', 'profesor'].includes(rolDe(req)) && String(curso.docente) === String(req.user.id))) {
      return res.status(403).json({ message: 'Solo el docente responsable puede consultar o modificar la rúbrica' });
    }
    if (!idValido(lectura) || !(await Lectura.exists({ _id: lectura }))) {
      return res.status(400).json({ message: 'Elige una lectura válida de la biblioteca' });
    }
    const fecha = fechaEntrega === undefined ? null : leerFecha(fechaEntrega);
    if (fecha === undefined) return res.status(400).json({ message: 'La fecha de entrega no es válida' });

    sesion.actividades.push({
      lectura,
      titulo: String(titulo || '').trim().slice(0, 150),
      instrucciones: String(instrucciones || '').trim().slice(0, 2000),
      objetivoAprendizaje: String(req.body.objetivoAprendizaje || '').trim().slice(0, 500),
      etapa: ['introduccion', 'explicacion', 'practica', 'comprobacion'].includes(req.body.etapa) ? req.body.etapa : 'practica',
      tipoEvidencia: ['respuestas', 'palabras_clave', 'resumen', 'respuesta_abierta'].includes(req.body.tipoEvidencia) ? req.body.tipoEvidencia : 'respuestas',
      peso: Number.isFinite(Number(req.body.peso)) ? Math.max(0, Math.min(100, Number(req.body.peso))) : 100,
      fechaEntrega: fecha,
      visible: visible !== false,
      rubrica: limpiarRubrica(rubrica),
    });

    // NOTIFICACIÓN: Avisar que hay nueva actividad
    if (req.io) {
      req.io.emit('curso-actualizado', { cursoId: curso._id });
    }

    await responderCurso(req, res, curso, 201);
  } catch (error) {
    console.error('Error en crearActividad:', error);
    res.status(500).json({ message: 'Error al crear la actividad' });
  }
};

// PUT /api/cursos/:id/sesiones/:sid/actividades/:aid   (todos los campos son opcionales)
exports.actualizarActividad = async (req, res) => {
  try {
    const curso = await cursoGestionable(req, res);
    if (!curso) return;
    const sesion = buscarSesion(curso, res, req.params.sid);
    if (!sesion) return;
    const act = idValido(req.params.aid) ? sesion.actividades.id(req.params.aid) : null;
    if (!act) return res.status(404).json({ message: 'Actividad no encontrada' });

    const b = req.body;
    if (b.rubrica !== undefined && !(['docente', 'profesor'].includes(rolDe(req)) && String(curso.docente) === String(req.user.id))) {
      return res.status(403).json({ message: 'Solo el docente responsable puede consultar o modificar la rúbrica' });
    }
    if (b.lectura !== undefined) {
      if (!idValido(b.lectura) || !(await Lectura.exists({ _id: b.lectura }))) {
        return res.status(400).json({ message: 'Elige una lectura válida de la biblioteca' });
      }
      act.lectura = b.lectura;
    }
    if (b.titulo !== undefined) act.titulo = String(b.titulo).trim().slice(0, 150);
    if (b.instrucciones !== undefined) act.instrucciones = String(b.instrucciones).trim().slice(0, 2000);
    if (b.objetivoAprendizaje !== undefined) act.objetivoAprendizaje = String(b.objetivoAprendizaje).trim().slice(0, 500);
    if (b.etapa !== undefined) {
      if (!['introduccion', 'explicacion', 'practica', 'comprobacion'].includes(b.etapa)) return res.status(400).json({ message: 'La etapa de aprendizaje no es válida' });
      act.etapa = b.etapa;
    }
    if (b.tipoEvidencia !== undefined) {
      if (!['respuestas', 'palabras_clave', 'resumen', 'respuesta_abierta'].includes(b.tipoEvidencia)) return res.status(400).json({ message: 'El tipo de evidencia no es válido' });
      act.tipoEvidencia = b.tipoEvidencia;
    }
    if (b.peso !== undefined) {
      const peso = Number(b.peso);
      if (!Number.isFinite(peso) || peso < 0 || peso > 100) return res.status(400).json({ message: 'El peso debe estar entre 0 y 100' });
      act.peso = peso;
    }
    if (b.fechaEntrega !== undefined) {
      const fecha = leerFecha(b.fechaEntrega);
      if (fecha === undefined) return res.status(400).json({ message: 'La fecha de entrega no es válida' });
      act.fechaEntrega = fecha;
    }
    if (b.visible !== undefined) act.visible = !!b.visible;
    if (b.rubrica !== undefined) act.rubrica = limpiarRubrica(b.rubrica);

    // NOTIFICACIÓN
    if (req.io) {
      req.io.emit('curso-actualizado', { cursoId: curso._id });
    }

    await responderCurso(req, res, curso);
  } catch (error) {
    console.error('Error en actualizarActividad:', error);
    res.status(500).json({ message: 'Error al actualizar la actividad' });
  }
};

// DELETE /api/cursos/:id/sesiones/:sid/actividades/:aid
exports.eliminarActividad = async (req, res) => {
  try {
    const curso = await cursoGestionable(req, res);
    if (!curso) return;
    const sesion = buscarSesion(curso, res, req.params.sid);
    if (!sesion) return;
    if (!idValido(req.params.aid) || !sesion.actividades.id(req.params.aid)) {
      return res.status(404).json({ message: 'Actividad no encontrada' });
    }
    sesion.actividades.pull(req.params.aid);

    // NOTIFICACIÓN
    if (req.io) {
      req.io.emit('curso-actualizado', { cursoId: curso._id });
    }

    await responderCurso(req, res, curso);
  } catch (error) {
    console.error('Error en eliminarActividad:', error);
    res.status(500).json({ message: 'Error al eliminar la actividad' });
  }
};

// Entrega de producto/evidencia. El servidor recupera objetivo y rúbrica desde el plan;
// nunca se aceptan criterios enviados por el navegador del alumno.
exports.entregarEvidencia = async (req, res) => {
  try {
    if (!idValido(req.params.id) || !idValido(req.params.sid) || !idValido(req.params.aid)) {
      return res.status(400).json({ message: 'Identificadores de curso o actividad inválidos' });
    }
    const respuesta = String(req.body.respuesta || '').trim();
    if (respuesta.length < 10) return res.status(400).json({ message: 'Escribe una respuesta de al menos 10 caracteres para poder revisarla' });
    if (respuesta.length > 12000) return res.status(413).json({ message: 'La evidencia supera el máximo de 12 000 caracteres' });

    const curso = await Curso.findOne({ _id: req.params.id, activo: { $ne: false } });
    if (!curso) return res.status(404).json({ message: 'Curso no encontrado' });
    if (!esAlumno(req) || !esMatriculado(curso, req.user.id)) return res.status(403).json({ message: 'Solo un alumno matriculado puede entregar esta actividad' });
    const sesion = curso.sesiones.id(req.params.sid);
    const actividad = sesion?.actividades.id(req.params.aid);
    if (!sesion || !actividad || !sesion.visible || !actividad.visible) return res.status(404).json({ message: 'La actividad no está disponible' });
    const acceso = await comprobarAccesoActividad(curso, actividad._id, req.user.id);
    if (!acceso.desbloqueada) return res.status(423).json({ message: 'Completa primero la actividad anterior con al menos 70/100. Revisa la retroalimentación y vuelve a intentarlo.' });

    const Lectura = require('../models/Lectura');
    const lectura = await Lectura.findById(actividad.lectura).select('titulo parrafos estado').lean();
    if (!lectura || ['Archivado', 'Borrador'].includes(lectura.estado)) return res.status(404).json({ message: 'El material de esta actividad no está disponible' });

    const previas = await ActivitySubmission.countDocuments({ cursoId: curso._id, actividadId: actividad._id, alumnoId: req.user.id });
    const intentoAnterior = previas ? await ActivitySubmission.findOne({ cursoId: curso._id, actividadId: actividad._id, alumnoId: req.user.id }).sort({ createdAt: -1 }).lean() : null;
    let puntaje = null;
    let retroalimentacion = 'Tu evidencia quedó registrada y pendiente de evaluación del docente.';
    let preguntaRefuerzo = '';
    let estado = 'pendiente';
    const apiKey = (process.env.GEMINI_API_KEY || '').trim().replace(/^['"]|['"]$/g, '');
    if (apiKey) {
      try {
        const cliente = new GoogleGenAI({ apiKey });
        const contexto = (lectura.parrafos || []).join('\n').slice(0, 9000);
        const rubrica = (actividad.rubrica?.criterios || []).map((c) => ({
          criterio: c.nombre, objetivo: c.objetivo,
          niveles: (c.niveles || []).map((n) => ({ nivel: n.nombre, puntos: n.puntos, descriptor: n.descriptor })),
        }));
        const consigna = intentoAnterior?.preguntaRefuerzo || actividad.instrucciones || 'Realiza la evidencia indicada por tu docente.';
        const contextoCurricular = [curso.institucion, curso.areaCurricular, curso.referenciaCurricular,
          ...(curso.competencias || []), curso.programacionCurricular].filter(Boolean).join('\n').slice(0, 3000);
        const prompt = `Eres evaluador pedagógico de comprensión lectora de secundaria. Evalúa la evidencia con justicia y ofrece retroalimentación orientadora. Devuelve SOLO un JSON válido con claves "puntaje" (número 0 a 100), "retroalimentacion" (máximo 100 palabras), y "preguntaRefuerzo" (una consigna/pregunta distinta y breve para practicar el mismo objetivo si el puntaje es menor a 70; si es 70 o más deja cadena vacía).\nCurso y contexto curricular del docente: ${contextoCurricular || curso.nombre}\nGrado: ${curso.grado}\nObjetivo de aprendizaje: ${actividad.objetivoAprendizaje || sesion.objetivoAprendizaje || sesion.temas || curso.nombre}\nEtapa: ${actividad.etapa}\nTipo de evidencia: ${actividad.tipoEvidencia}\nConsigna que debía resolver: ${consigna}\nRúbrica privada del docente (úsala solo para evaluar; no la reproduzcas ni enumeres sus criterios): ${JSON.stringify(rubrica)}\nMaterial fuente: ${contexto}\nEvidencia del alumno: ${respuesta}\nSi falta rúbrica, asigna puntaje según objetivo e instrucciones. Da una fortaleza y un siguiente paso concreto; no reveles respuestas modelo.`;
        let salida = '';
        for (const modelo of MODELOS) {
          try {
            const generado = await cliente.models.generateContent({ model: modelo, contents: prompt });
            salida = generado.text || '';
            if (salida) break;
          } catch (e) { if (Number(e?.status || e?.code) !== 404) throw e; }
        }
        const json = salida.match(/\{[\s\S]*\}/)?.[0];
        const evaluacion = json ? JSON.parse(json) : null;
        if (evaluacion && Number.isFinite(Number(evaluacion.puntaje)) && typeof evaluacion.retroalimentacion === 'string') {
          puntaje = Math.round(Math.max(0, Math.min(100, Number(evaluacion.puntaje))) * 100) / 100;
          retroalimentacion = evaluacion.retroalimentacion.slice(0, 1500);
          preguntaRefuerzo = puntaje < 70 && typeof evaluacion.preguntaRefuerzo === 'string' ? evaluacion.preguntaRefuerzo.slice(0, 500) : '';
          estado = 'evaluada';
        }
      } catch (e) {
        console.error('[evidencia] Evaluación IA no disponible:', e.message);
      }
    }
    const entrega = await ActivitySubmission.create({
      cursoId: curso._id, sesionId: sesion._id, actividadId: actividad._id, lecturaId: actividad.lectura,
      alumnoId: req.user.id, planVersion: curso.planVersion || 1, tipoEvidencia: actividad.tipoEvidencia,
      respuesta, puntaje, retroalimentacion, preguntaRefuerzo, intento: previas + 1, estado,
    });
    return res.status(201).json({ entrega: { _id: entrega._id, puntaje, retroalimentacion, preguntaRefuerzo, intento: entrega.intento, estado, createdAt: entrega.createdAt } });
  } catch (error) {
    console.error('Error al guardar evidencia:', error);
    return res.status(500).json({ message: 'No se pudo guardar la evidencia' });
  }
};

// Reporte de entregas y promedio ponderado por actividad para el docente dueño/admin.
exports.reporteEvidencias = async (req, res) => {
  try {
    const curso = await cursoGestionable(req, res);
    if (!curso) return;
    const [entregas, progresosLectura] = await Promise.all([
      ActivitySubmission.find({ cursoId: curso._id })
        .populate('alumnoId', 'nombre apellido email').populate('revisionesNota.actorId', 'nombre apellido email').sort({ createdAt: -1 }).limit(1000).lean(),
      StudentProgress.find({ cursoId: curso._id, actividadId: { $ne: null } })
        .populate('alumnoId', 'nombre apellido email').populate('readingId', 'titulo').sort({ fecha: -1 }).limit(5000).lean(),
    ]);
    const actividades = curso.sesiones.flatMap((s) => s.actividades.map((a) => ({
      actividadId: String(a._id), titulo: a.titulo || 'Actividad', peso: Number(a.peso) || 0,
    })));
    const porAlumno = new Map();
    const actividadPorAlumno = new Map();
    for (const e of entregas) {
      const alumnoKey = String(e.alumnoId?._id || e.alumnoId);
      const key = `${alumnoKey}:${e.actividadId}`;
      if (!actividadPorAlumno.has(key)) actividadPorAlumno.set(key, { alumno: e.alumnoId, actividadId: String(e.actividadId), evidencia: e.puntaje });
    }
    for (const p of progresosLectura) {
      const alumnoKey = String(p.alumnoId?._id || p.alumnoId);
      const key = `${alumnoKey}:${p.actividadId}`;
      const registro = actividadPorAlumno.get(key) || { alumno: p.alumnoId, actividadId: String(p.actividadId), evidencia: null };
      if (registro.interaccion === undefined) registro.interaccion = Math.max(0, Math.min(100, Number(p.notaAjustada?.general ?? p.idli) || 0));
      const nivelValor = (ajustado, original, escala = 1) => {
        const n = Number(ajustado ?? original) * escala;
        return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
      };
      registro.niveles = {
        literal: nivelValor(p.notaAjustada?.literal, p.nivelLiteral?.inflesz),
        inferencial: nivelValor(p.notaAjustada?.inferencial, p.nivelInferencial?.rougeL, 100),
        critico: nivelValor(p.notaAjustada?.critico, p.nivelCritico?.rougeS, 100),
      };
      registro.progreso = p;
      actividadPorAlumno.set(key, registro);
    }
    for (const registro of actividadPorAlumno.values()) {
      const actividad = actividades.find((a) => a.actividadId === registro.actividadId);
      if (!actividad || actividad.peso <= 0) continue;
      const componentes = [registro.evidencia, registro.interaccion].filter((v) => Number.isFinite(v));
      if (!componentes.length) continue;
      const combinado = componentes.reduce((s, v) => s + v, 0) / componentes.length;
      const alumnoKey = String(registro.alumno?._id || registro.alumno);
      const previo = porAlumno.get(alumnoKey) || { alumno: registro.alumno, suma: 0, pesos: 0, productos: [], interacciones: [], desempeno: [], niveles: { literal: [], inferencial: [], critico: [] } };
      previo.suma += combinado * actividad.peso;
      previo.pesos += actividad.peso;
      if (Number.isFinite(registro.evidencia)) previo.productos.push(registro.evidencia);
      if (Number.isFinite(registro.interaccion)) previo.interacciones.push(registro.interaccion);
      for (const nivel of ['literal', 'inferencial', 'critico']) if (Number.isFinite(registro.niveles?.[nivel])) previo.niveles[nivel].push(registro.niveles[nivel]);
      previo.desempeno.push({ actividad: actividad.titulo, peso: actividad.peso, evidencia: registro.evidencia ?? null, interaccion: registro.interaccion ?? null, niveles: registro.niveles || null, combinado: Math.round(combinado * 100) / 100 });
      porAlumno.set(alumnoKey, previo);
    }
    // Conserva alumnos con entregas que aún no tienen puntuación, como pendientes de revisión.
    for (const e of entregas) {
      const key = String(e.alumnoId?._id || e.alumnoId);
      if (!porAlumno.has(key)) porAlumno.set(key, { alumno: e.alumnoId, suma: 0, pesos: 0, productos: [], interacciones: [], desempeno: [], niveles: { literal: [], inferencial: [], critico: [] } });
    }
    res.json({
      curso: { _id: curso._id, nombre: curso.nombre, planVersion: curso.planVersion },
      entregas: entregas.map((e) => ({ ...e, alumno: e.alumnoId, actividad: actividades.find((a) => a.actividadId === String(e.actividadId)) || null })),
      promediosPonderados: [...porAlumno.values()].map((p) => ({
        alumno: p.alumno, nota: p.pesos ? Math.round((p.suma / p.pesos) * 100) / 100 : null, pesoEvaluado: p.pesos,
        promedioProductos: p.productos.length ? Math.round(p.productos.reduce((a, b) => a + b, 0) / p.productos.length * 100) / 100 : null,
        promedioComprension: p.interacciones.length ? Math.round(p.interacciones.reduce((a, b) => a + b, 0) / p.interacciones.length * 100) / 100 : null,
        niveles: Object.fromEntries(Object.entries(p.niveles).map(([nivel, valores]) => [nivel, valores.length ? Math.round(valores.reduce((a, b) => a + b, 0) / valores.length * 100) / 100 : null])),
        desempeno: p.desempeno,
      })),
    });
  } catch (error) {
    console.error('Error al consultar entregas:', error);
    res.status(500).json({ message: 'No se pudo consultar el reporte de evidencias' });
  }
};

exports.misEvidencias = async (req, res) => {
  try {
    if (!idValido(req.params.id) || !idValido(req.params.aid)) return res.status(400).json({ message: 'Identificador inválido' });
    const curso = await Curso.findOne({ _id: req.params.id, activo: { $ne: false } }).select('alumnos');
    if (!curso) return res.status(404).json({ message: 'Curso no encontrado' });
    if (!esAlumno(req) || !esMatriculado(curso, req.user.id)) return res.status(403).json({ message: 'No tienes acceso a este curso' });
    const entregas = await ActivitySubmission.find({ cursoId: curso._id, actividadId: req.params.aid, alumnoId: req.user.id })
      .sort({ createdAt: -1 }).limit(20).lean();
    res.json({ entregas });
  } catch (error) {
    console.error('Error al recuperar entregas del alumno:', error);
    res.status(500).json({ message: 'No se pudo recuperar tu historial de entregas' });
  }
};

exports.calificarEvidencia = async (req, res) => {
  try {
    const curso = await cursoGestionable(req, res);
    if (!curso) return;
    if (!idValido(req.params.entregaId)) return res.status(400).json({ message: 'Identificador de entrega inválido' });
    const entrega = await ActivitySubmission.findOne({ _id: req.params.entregaId, cursoId: curso._id });
    if (!entrega) return res.status(404).json({ message: 'No se encontró la entrega' });
    const puntaje = Number(req.body.puntaje);
    if (!Number.isFinite(puntaje) || puntaje < 0 || puntaje > 100) return res.status(400).json({ message: 'El puntaje debe estar entre 0 y 100' });
    const motivo = String(req.body.motivo || '').trim().slice(0, 500);
    entrega.revisionesNota.push({ actorId: req.user.id, antes: entrega.puntaje, despues: puntaje, motivo: motivo || 'Calificación o ajuste docente' });
    entrega.puntaje = Math.round(puntaje * 100) / 100;
    if (req.body.retroalimentacion !== undefined) entrega.retroalimentacion = String(req.body.retroalimentacion).trim().slice(0, 1500);
    entrega.estado = 'evaluada';
    await entrega.save();
    await registrarAccion(req, { action: 'evidencia.nota.ajustada', entity: 'ActivitySubmission', entityId: entrega._id, affectedUserId: entrega.alumnoId, details: { cursoId: String(curso._id), actividadId: String(entrega.actividadId), revisionId: String(entrega.revisionesNota.at(-1)._id), puntaje: entrega.puntaje, motivo: motivo || 'Calificación o ajuste docente' } });
    res.json({ entrega });
  } catch (error) {
    console.error('Error al calificar evidencia:', error);
    res.status(500).json({ message: 'No se pudo guardar la calificación' });
  }
};

exports.restaurarCalificacionEvidencia = async (req, res) => {
  try {
    const curso = await cursoGestionable(req, res);
    if (!curso) return;
    if (!idValido(req.params.entregaId) || !idValido(req.params.revisionId)) return res.status(400).json({ message: 'Identificador inválido' });
    const entrega = await ActivitySubmission.findOne({ _id: req.params.entregaId, cursoId: curso._id });
    if (!entrega) return res.status(404).json({ message: 'No se encontró la entrega' });
    const revision = entrega.revisionesNota.id(req.params.revisionId);
    if (!revision) return res.status(404).json({ message: 'No se encontró la revisión de nota' });
    const anterior = entrega.puntaje;
    entrega.revisionesNota.push({ actorId: req.user.id, antes: anterior, despues: revision.antes, motivo: `Restauración de revisión ${revision._id}` });
    entrega.puntaje = revision.antes;
    entrega.estado = revision.antes == null ? 'pendiente' : 'evaluada';
    await entrega.save();
    await registrarAccion(req, { action: 'evidencia.nota.restaurada', entity: 'ActivitySubmission', entityId: entrega._id, affectedUserId: entrega.alumnoId, details: { cursoId: String(curso._id), actividadId: String(entrega.actividadId), revisionId: String(revision._id), puntajeAnterior: anterior, puntajeRestaurado: entrega.puntaje } });
    res.json({ entrega, message: 'Se restauró la calificación anterior' });
  } catch (error) {
    console.error('Error al restaurar calificación:', error);
    res.status(500).json({ message: 'No se pudo restaurar la calificación' });
  }
};

exports.matricularAlumnoEnSuSeccion = async (alumno) => {
  try {
    if (!alumno || alumno.rol !== 'alumno' || !alumno.grado || !alumno.seccion) return 0;
    const r = await Curso.updateMany(
      { grado: alumno.grado, seccion: String(alumno.seccion).toUpperCase(), activo: { $ne: false } },
      { $addToSet: { alumnos: alumno._id } }
    );
    return r.modifiedCount;
  } catch (error) {
    console.error('No se pudo matricular automáticamente al alumno:', error.message);
    return 0;
  }
};
