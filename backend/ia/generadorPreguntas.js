const pdfParseLib = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const { generarTexto } = require('./gemini');

// pdf-parse 1.x se usa como función; la 2.x exporta la clase PDFParse. Se admiten las dos.
async function textoDeBuffer(buffer) {
  if (typeof pdfParseLib === 'function') {
    const data = await pdfParseLib(buffer);
    return data.text || '';
  }
  if (typeof pdfParseLib.default === 'function') {
    const data = await pdfParseLib.default(buffer);
    return data.text || '';
  }
  if (pdfParseLib.PDFParse) {
    const parser = new pdfParseLib.PDFParse({ data: new Uint8Array(buffer) });
    try {
      const resultado = await parser.getText();
      return resultado.text || '';
    } finally {
      if (typeof parser.destroy === 'function') await parser.destroy();
    }
  }
  throw new Error('La versión instalada de pdf-parse no es compatible.');
}

/**
 * Extrae el texto plano de un archivo PDF.
 * @param {string} rutaRelativa  p. ej.  "/uploads/1790774373448.pdf"
 */
async function extraerTextoPdf(rutaRelativa) {
  const ruta = path.join(__dirname, '..', rutaRelativa);
  const buffer = fs.readFileSync(ruta);
  return textoDeBuffer(buffer);
}

const NIVELES = ['literal', 'inferencial', 'critico'];
const normalizarNivel = (n) =>
  String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function validarYNormalizar(p) {
  const mcq = (Array.isArray(p.preguntasOpcionMultiple) ? p.preguntasOpcionMultiple : [])
    .map((q) => ({ ...q, nivel: normalizarNivel(q.nivel) }))
    .filter((q) => q.enunciado && Array.isArray(q.opciones) && q.opciones.length >= 2 && q.respuestaCorrecta);

  for (const n of NIVELES) {
    if (!mcq.some((q) => q.nivel === n)) throw new Error(`La IA no generó ninguna pregunta de nivel ${n}`);
  }
  if (!p.preguntaLiteral?.enunciado) throw new Error('Falta la pregunta abierta literal');
  if (!p.preguntaInferencial?.enunciado || !p.preguntaInferencial?.respuestaReferencia) throw new Error('Falta la pregunta abierta inferencial');
  if (!p.preguntaCritico?.enunciado || !p.preguntaCritico?.respuestaReferencia) throw new Error('Falta la pregunta abierta crítica');

  // Ordena por nivel y renumera ids 1..n
  mcq.sort((a, b) => NIVELES.indexOf(a.nivel) - NIVELES.indexOf(b.nivel));
  p.preguntasOpcionMultiple = mcq.map((q, i) => ({ ...q, id: i + 1 }));
  return p;
}

// Si el texto es largo se toman 3 fragmentos (inicio, medio y final) para que las preguntas
// representen todo el documento y no solo sus primeras páginas.
function muestrear(texto, max = 9000) {
  const t = texto.replace(/\s+\n/g, '\n').trim();
  if (t.length <= max) return t;
  const parte = Math.floor(max / 3);
  const medio = Math.floor(t.length / 2) - Math.floor(parte / 2);
  return [t.slice(0, parte), t.slice(medio, medio + parte), t.slice(-parte)].join('\n[...]\n');
}

async function generarPreguntasConIA(texto) {
  const fragmento = muestrear(texto);

  const prompt = `
Eres un experto en didáctica de la comprensión lectora para estudiantes de secundaria (Perú).
Con el siguiente texto genera preguntas en TRES niveles: literal, inferencial y crítico.

TEXTO:
"""
${fragmento}
"""

Responde ÚNICAMENTE con un objeto JSON válido (sin markdown ni texto adicional) con esta estructura:
{
  "preguntasOpcionMultiple": [
    {
      "id": 1,
      "nivel": "literal",
      "enunciado": "...",
      "opciones": [
        { "id": "A", "texto": "..." },
        { "id": "B", "texto": "..." },
        { "id": "C", "texto": "..." },
        { "id": "D", "texto": "..." }
      ],
      "respuestaCorrecta": "A"
    }
  ],
  "preguntaLiteral": { "enunciado": "..." },
  "preguntaInferencial": { "enunciado": "...", "respuestaReferencia": "..." },
  "preguntaCritico": { "enunciado": "...", "respuestaReferencia": "..." }
}

Reglas:
- "preguntasOpcionMultiple" debe tener exactamente 6 preguntas: 2 con "nivel":"literal", 2 con "nivel":"inferencial" y 2 con "nivel":"critico".
- literal: lo que el texto dice directamente. inferencial: requiere deducir algo no dicho de forma explícita. critico: pide valorar u opinar con fundamento en el texto (en opción múltiple, elige la postura mejor sustentada).
- Cada pregunta tiene 4 opciones (A, B, C, D) y una sola correcta; reparte las respuestas correctas entre A, B, C y D.
- Las 3 preguntas abiertas son obligatorias. Las respuestaReferencia son respuestas modelo completas (2-4 oraciones), nunca vacías.
- Basa TODAS las preguntas y alternativas únicamente en el TEXTO dado; no uses conocimiento externo ni el título del libro.
- Lenguaje claro para adolescentes peruanos de 12-16 años.
`;

  let ultimoError;
  for (let vez = 1; vez <= 2; vez++) {
    try {
      let raw = (await generarTexto(prompt, { responseMimeType: 'application/json' })).trim();
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      return validarYNormalizar(JSON.parse(raw));
    } catch (e) {
      ultimoError = e;
      console.error(`[IA] Respuesta no válida (vez ${vez}/2):`, e.message);
      if (e.status || /^\d{3}$/.test(String(e.code))) break; // error de la API: ya se reintentó en gemini.js
    }
  }
  throw new Error(`No se pudieron generar las preguntas: ${ultimoError.message}`);
}

module.exports = { extraerTextoPdf, generarPreguntasConIA };