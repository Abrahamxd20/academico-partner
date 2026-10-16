const mongoose = require('mongoose');
const Curso = require('../models/Curso');
const CursoPlanVersion = require('../models/CursoPlanVersion');
const { registrarAccion } = require('../utils/auditoria');

const rol = (req) => String(req.user?.rol || '').toLowerCase();

module.exports = async function versionarPlanCurso(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return next();
  try {
    const curso = await Curso.findOne({ _id: req.params.id, activo: { $ne: false } })
      .select('nombre descripcion institucion areaCurricular referenciaCurricular competencias programacionCurricular grado seccion docente sesiones planVersion').lean();
    if (!curso || (rol(req) !== 'admin' && String(curso.docente) !== String(req.user?.id))) return next();

    const snapshot = {
      nombre: curso.nombre,
      descripcion: curso.descripcion,
      institucion: curso.institucion || '',
      areaCurricular: curso.areaCurricular || '',
      referenciaCurricular: curso.referenciaCurricular || '',
      competencias: curso.competencias || [],
      programacionCurricular: curso.programacionCurricular || '',
      grado: curso.grado,
      seccion: curso.seccion,
      sesiones: curso.sesiones || [],
    };
    const route = `${req.baseUrl || ''}${req.route?.path || req.path}`;
    const enviarJson = res.json.bind(res);
    let versionGuardada = false;
    res.json = (body) => {
      if (versionGuardada || res.statusCode < 200 || res.statusCode >= 300) return enviarJson(body);
      versionGuardada = true;
      const guardarVersion = async () => {
        // El incremento atómico asigna una versión distinta aunque dos docentes editen a la vez.
        const anterior = await Curso.findByIdAndUpdate(curso._id, { $inc: { planVersion: 1 } }, { new: false })
          .select('planVersion').lean();
        const version = anterior?.planVersion || curso.planVersion || 1;
        await CursoPlanVersion.create({ cursoId: curso._id, version, snapshot, action: `${req.method} ${route}`, actorId: req.user.id });
        await registrarAccion(req, {
          action: req.method === 'DELETE' ? 'curso.eliminado' : (req.path.includes('/restaurar') ? 'curso.plan.restaurado' : 'curso.plan.modificado'),
          entity: 'Curso', entityId: curso._id,
          details: {
            metodo: req.method, ruta: route, versionAnterior: version, versionActual: version + 1,
            campos: Object.keys(req.body || {}).filter((campo) => !/password|respuesta|rubrica/i.test(campo)).slice(0, 30),
          },
        });
        if (body && typeof body === 'object') {
          if (body.planVersion !== undefined) body.planVersion = version + 1;
          if (body.curso?.planVersion !== undefined) body.curso.planVersion = version + 1;
        }
      };
      return guardarVersion().catch((error) => {
        console.error('[plan] No se pudo guardar la versión del curso:', error.message);
      }).then(() => enviarJson(body));
    };
    return next();
  } catch (error) {
    console.error('[plan] No se pudo capturar la planificación anterior:', error.message);
    return res.status(500).json({ message: 'No se pudo preparar el historial del plan' });
  }
};
