const ActivitySubmission = require('../models/ActivitySubmission');
const StudentProgress = require('../models/StudentProgress');

const puntajeSeguro = (valor) => {
  const n = Number(valor);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
};

// La secuencia respeta el orden en que el docente organizó sesiones y actividades.
// Una etapa se domina con 70/100, el mismo umbral usado para activar el refuerzo.
async function estadosRutaAprendizaje(curso, alumnoId) {
  const actividades = (curso.sesiones || []).flatMap((sesion) =>
    sesion.visible === false ? [] : (sesion.actividades || [])
      .filter((actividad) => actividad.visible !== false && actividad.lectura
        && (!actividad.lectura?.estado || !['Archivado', 'Borrador'].includes(actividad.lectura.estado)))
      .map((actividad) => ({ actividad, sesion }))
  );
  const ids = actividades.map(({ actividad }) => actividad._id);
  if (!ids.length) return new Map();

  const [entregas, progresos] = await Promise.all([
    ActivitySubmission.aggregate([
      { $match: { cursoId: curso._id, alumnoId, actividadId: { $in: ids } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$actividadId', ultimo: { $first: '$$ROOT' }, mejorPuntaje: { $max: '$puntaje' } } },
    ]),
    StudentProgress.aggregate([
      { $match: { cursoId: curso._id, alumnoId, actividadId: { $in: ids } } },
      { $sort: { fecha: -1 } },
      { $group: { _id: '$actividadId', ultimo: { $first: '$$ROOT' } } },
    ]),
  ]);
  const ultimoProgreso = new Map();
  const entregaPorActividad = new Map(entregas.map((item) => [String(item._id), item]));
  for (const item of progresos) ultimoProgreso.set(String(item._id), item.ultimo);

  const resultado = new Map();
  let puedeAvanzar = true;
  actividades.forEach(({ actividad }, indice) => {
    const key = String(actividad._id);
    const resumenEntrega = entregaPorActividad.get(key);
    const entrega = resumenEntrega?.ultimo;
    const progreso = ultimoProgreso.get(key);
    const interaccion = progreso ? puntajeSeguro(progreso.notaAjustada?.general ?? progreso.idli) : null;
    const mejorEvidencia = resumenEntrega?.mejorPuntaje == null ? null : puntajeSeguro(resumenEntrega.mejorPuntaje);
    const puntajeActual = [entrega?.puntaje == null ? null : puntajeSeguro(entrega.puntaje), interaccion]
      .filter((n) => n !== null);
    const actual = puntajeActual.length ? puntajeActual.reduce((s, n) => s + n, 0) / puntajeActual.length : null;
    const puntajesHistoricos = mejorEvidencia !== null && interaccion !== null
      ? [(mejorEvidencia + interaccion) / 2]
      : (mejorEvidencia !== null ? [mejorEvidencia] : (interaccion === null ? [] : [interaccion]));
    const maximo = puntajesHistoricos.length ? Math.max(...puntajesHistoricos) : null;
    const puntajeDominio = maximo !== null && maximo >= 70 ? maximo : actual;
    const estado = !puedeAvanzar ? 'bloqueada' : puntajeDominio === null ? 'actual' : puntajeDominio >= 70 ? 'dominada' : 'refuerzo';
    resultado.set(key, {
      estado, bloqueada: estado === 'bloqueada', puntaje: puntajeDominio === null ? null : Math.round(puntajeDominio * 100) / 100,
      indice: indice + 1, total: actividades.length,
      preguntaRefuerzo: entrega?.preguntaRefuerzo || '', retroalimentacion: entrega?.retroalimentacion || '',
    });
    puedeAvanzar = puedeAvanzar && estado === 'dominada';
  });
  return resultado;
}

async function comprobarAccesoActividad(curso, actividadId, alumnoId) {
  const estados = await estadosRutaAprendizaje(curso, alumnoId);
  const estado = estados.get(String(actividadId));
  if (!estado) return { encontrada: false, desbloqueada: false };
  return { encontrada: true, desbloqueada: !estado.bloqueada, estado };
}

module.exports = { estadosRutaAprendizaje, comprobarAccesoActividad };
