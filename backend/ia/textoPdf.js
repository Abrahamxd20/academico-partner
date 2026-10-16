const { extraerTextoPdf } = require('./generadorPreguntas');

/**
 * Convierte el texto plano de un PDF en una lista de párrafos legibles.
 * - Une las palabras cortadas por guion al final de línea.
 * - Respeta las líneas en blanco como separador de párrafos.
 * - Si el PDF no tiene líneas en blanco (todo queda en un bloque enorme), lo parte por oraciones.
 */
function textoAParrafos(texto) {
  const limpio = String(texto || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/-\n(?=[a-záéíóúüñ])/g, ''); // pala-\nbra -> palabra

  const bloques = limpio
    .split(/\n\s*\n/)
    .map((b) => b.replace(/\s*\n\s*/g, ' ').trim())
    .filter((b) => b.length > 40);

  const parrafos = [];
  for (const bloque of bloques) {
    if (bloque.length <= 900) { parrafos.push(bloque); continue; }
    const oraciones = bloque.match(/[^.!?…]+[.!?…]+["”»)]*\s*|[^.!?…]+$/g) || [bloque];
    let actual = '';
    for (const o of oraciones) {
      if (actual && (actual + o).length > 700) { parrafos.push(actual.trim()); actual = o; }
      else actual += o;
    }
    if (actual.trim()) parrafos.push(actual.trim());
  }
  return parrafos;
}

/** Lee el PDF guardado en /uploads y devuelve sus párrafos y el tiempo estimado de lectura. */
async function leerPdfComoParrafos(rutaRelativa) {
  const texto = await extraerTextoPdf(rutaRelativa);
  const parrafos = textoAParrafos(texto);
  const palabras = parrafos.join(' ').split(/\s+/).filter(Boolean).length;
  const minutos = Math.max(1, Math.ceil(palabras / 200)); // ~200 palabras por minuto
  return { texto, parrafos, minutos };
}

module.exports = { textoAParrafos, leerPdfComoParrafos };