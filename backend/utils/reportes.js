// Cálculos del dashboard de Reportes y de la ficha de observación.
// Los umbrales replican los de ia/feedbackAsistente.js para que docente y alumno vean la misma valoración.

const NIVELES = {
  general: { etiqueta: 'General (IDLI)', umbrales: [80, 60, 40] },
  literal: { etiqueta: 'Literal (Inflesz)', umbrales: [80, 60, 40] },
  inferencial: { etiqueta: 'Inferencial (ROUGE-L)', umbrales: [50, 30, 15] }, // ROUGE-L x 100
  critico: { etiqueta: 'Crítico (ROUGE-S)', umbrales: [35, 20, 10] },        // ROUGE-S x 100
};

const BANDAS = ['Destacado', 'Logrado', 'En proceso', 'Requiere apoyo'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];

const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0));
const r1 = (v) => Number((Number(v) || 0).toFixed(1));
const promedio = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);
const idDe = (v) => String(v?._id ?? v ?? '');

// Puntaje 0-100 de un registro para el nivel indicado
function puntaje(reg, nivel) {
  if (Number.isFinite(reg.notaAjustada?.[nivel])) return clamp(reg.notaAjustada[nivel]);
  switch (nivel) {
    case 'literal': return clamp(reg.nivelLiteral?.inflesz);
    case 'inferencial': return clamp((reg.nivelInferencial?.rougeL || 0) * 100);
    case 'critico': return clamp((reg.nivelCritico?.rougeS || 0) * 100);
    default: return clamp(reg.idli);
  }
}

function bandaDe(valor, nivel) {
  const [a, b, c] = NIVELES[nivel].umbrales;
  if (valor >= a) return BANDAS[0];
  if (valor >= b) return BANDAS[1];
  if (valor >= c) return BANDAS[2];
  return BANDAS[3];
}

function agrupar(registros, claveFn) {
  const mapa = new Map();
  registros.forEach((r) => {
    const k = claveFn(r);
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(r);
  });
  return mapa;
}

function construirDashboard(registros, nivel = 'general') {
  const valores = registros.map((r) => puntaje(r, nivel));

  const porNivel = {};
  ['literal', 'inferencial', 'critico', 'general'].forEach((n) => {
    porNivel[n] = r1(promedio(registros.map((r) => puntaje(r, n))));
  });

  const porLectura = [...agrupar(registros, (r) => idDe(r.readingId)).values()]
    .map((g) => ({
      lectura: g[0].readingId?.titulo || 'Sin título',
      valor: r1(promedio(g.map((r) => puntaje(r, nivel)))),
      intentos: g.length,
    }))
    .sort((a, b) => b.valor - a.valor);

  const conteo = Object.fromEntries(BANDAS.map((b) => [b, 0]));
  valores.forEach((v) => { conteo[bandaDe(v, nivel)] += 1; });
  const distribucion = BANDAS.map((banda) => ({
    banda,
    cantidad: conteo[banda],
    porcentaje: registros.length ? r1((conteo[banda] * 100) / registros.length) : 0,
  }));

  const porMes = agrupar(registros, (r) => {
    const f = new Date(r.fecha);
    return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
  });
  const evolucion = [...porMes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([clave, g]) => ({
      clave,
      etiqueta: `${MESES[Number(clave.slice(5)) - 1]} ${clave.slice(2, 4)}`,
      promedio: r1(promedio(g.map((r) => puntaje(r, nivel)))),
      intentos: g.length,
    }));

  // Alumnos con menor promedio primero (los que más apoyo necesitan)
  const alumnos = [...agrupar(registros, (r) => idDe(r.alumnoId)).values()]
    .map((g) => {
      const prom = promedio(g.map((r) => puntaje(r, nivel)));
      return {
        nombre: g[0].alumnoId?.nombre || 'Alumno',
        grado: g[0].alumnoId?.grado || '',
        seccion: g[0].alumnoId?.seccion || '',
        intentos: g.length,
        promedio: r1(prom),
        banda: bandaDe(prom, nivel),
      };
    })
    .sort((a, b) => a.promedio - b.promedio);

  return {
    nivel,
    kpis: {
      intentos: registros.length,
      alumnos: alumnos.length,
      promedio: r1(promedio(valores)),
      idli: porNivel.general,
      pa: r1(promedio(registros.map((r) => clamp(r.porcentajeAciertos)))),
      etr: r1(promedio(registros.map((r) => Number(r.eficienciaTemporal) || 0))),
    },
    porNivel,
    porLectura,
    distribucion,
    evolucion,
    alumnos: alumnos.slice(0, 8),
    totalAlumnos: alumnos.length,
  };
}

// ---------- Observaciones para la ficha (redactadas para el docente) ----------
const OBSERVACIONES = {
  literal: [
    'Reformula la información explícita del texto con claridad y precisión.',
    'Identifica la información explícita; algunas ideas se expresan con oraciones extensas.',
    'Reconoce parte de la información explícita, pero la redacta de forma compleja o incompleta.',
    'Requiere apoyo para localizar y reformular la información explícita del texto.',
  ],
  inferencial: [
    'Deduce con solidez las relaciones e ideas implícitas del texto.',
    'Interpreta el texto y toca varias ideas relevantes; puede profundizar sus deducciones.',
    'Su interpretación se relaciona solo parcialmente con las ideas del texto.',
    'Requiere apoyo para deducir ideas implícitas; su respuesta se aleja de lo que plantea el texto.',
  ],
  critico: [
    'Argumenta su postura conectando varias ideas del texto de forma sólida.',
    'Sustenta su opinión con una base adecuada; puede vincular más ideas o ejemplos.',
    'Emite su opinión apoyándose en pocas ideas del texto.',
    'Requiere apoyo para justificar su opinión con ideas concretas de la lectura.',
  ],
};

// Devuelve el nivel con la valoración más baja (empate: literal > inferencial > crítico)
function nivelAReforzar(bandas) {
  const orden = ['literal', 'inferencial', 'critico'];
  const nombres = { literal: 'Literal', inferencial: 'Inferencial', critico: 'Crítico' };
  let peor = orden[0];
  orden.forEach((n) => {
    if (BANDAS.indexOf(bandas[n]) > BANDAS.indexOf(bandas[peor])) peor = n;
  });
  if (BANDAS.indexOf(bandas[peor]) <= 1) {
    return { etiqueta: 'Ninguno (mantener)', observacion: 'Mantiene un desempeño favorable en los tres niveles de comprensión.' };
  }
  return { etiqueta: nombres[peor], observacion: OBSERVACIONES[peor][BANDAS.indexOf(bandas[peor])] };
}

module.exports = { NIVELES, BANDAS, puntaje, bandaDe, construirDashboard, nivelAReforzar };
