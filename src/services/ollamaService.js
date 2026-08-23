import { Ollama } from 'ollama';

const ollama = new Ollama({ host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434' });

export const generateQuestionsWithAI = async (textoLectura) => {
  const prompt = `
    Eres un experto en pedagogía para alumnos de 4to de secundaria.
    Analiza la siguiente lectura y genera 3 preguntas de comprensión lectora (1 literal, 1 inferencial y 1 crítica).
    Cada pregunta debe tener 4 opciones de respuesta y señalar cuál es el índice de la opción correcta (0, 1, 2 o 3).

    Lectura: "${textoLectura}"

    Responde ÚNICAMENTE en formato JSON con la siguiente estructura estricta:
    {
      "preguntas": [
        {
          "enunciado": "Texto de la pregunta",
          "opciones": ["Opción A", "Opción B", "Opción C", "Opción D"],
          "respuestaCorrecta": 0,
          "nivel": "literal"
        }
      ]
    }
  `;

  try {
    const response = await ollama.chat({
      model: 'qwen2.5:7b',
      messages: [{ role: 'user', content: prompt }],
      format: 'json'
    });

    return JSON.parse(response.message.content);
  } catch (error) {
    throw new Error(`Error en el modelo Ollama: ${error.message}`);
  }
};