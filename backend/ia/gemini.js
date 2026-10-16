const { GoogleGenAI } = require('@google/genai');

let ai = null;
const obtenerCliente = () => {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim().replace(/^["']|["']$/g, '');
  if (!apiKey) return null;
  if (!ai) ai = new GoogleGenAI({ apiKey });
  return ai;
};

// El primero es el de tu .env; los demás son respaldo si Google retira un modelo (404).
const MODELOS = [process.env.GEMINI_MODEL || 'gemini-3.7-flash'];

const codigoDe = (e) =>
  Number(e?.status || e?.code) || Number((e?.message || '').match(/\b([45]\d\d)\b/)?.[1]) || 0;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function generarTexto(contents, config) {
  const cliente = obtenerCliente();
  if (!cliente) throw new Error('Falta GEMINI_API_KEY en backend/.env (reinicia el servidor tras agregarla).');

  let ultimoError;
  for (const model of MODELOS) {
    // Hasta 5 intentos por modelo cuando el fallo es temporal (503 saturado, 429 límite, 500).
    for (let intento = 1; intento <= 5; intento++) {
      try {
        const r = await cliente.models.generateContent({ model, contents, config });
        if (!r.text) throw new Error('La IA devolvió una respuesta vacía.');
        return r.text;
      } catch (e) {
        ultimoError = e;
        const c = codigoDe(e);
       console.error(`[IA] ${model} (intento ${intento}/5) falló con ${c || 'error'}:`, String(e.message).slice(0, 200));
  const temporal = c === 503 || c === 429 || c === 500;
  if (temporal && intento < 5) { await esperar(2000 * intento); continue; } // 2, 4, 6, 8 s
  break; // pasa al siguiente modelo (404, 503 persistente, etc.)
      }
    }
    const c = codigoDe(ultimoError);
    if (c === 400 || c === 401 || c === 403) break; // cambiar de modelo no ayuda
  }
  throw ultimoError;
}

module.exports = { generarTexto, codigoDe, MODELOS };