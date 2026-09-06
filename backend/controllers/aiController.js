const { GoogleGenerativeAI } = require('@google/generative-ai');

exports.atenderConsultaIA = async (req, res) => {
  try {
    const { mensaje = "", textoLectura = "" } = req.body;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ respuesta: "Error: No existe GEMINI_API_KEY en .env" });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Cambia el string del modelo por "gemini-1.5-flash" o "gemini-2.5-flash"
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    const prompt = `
      Eres un asistente de lectura para estudiantes.
      Texto de contexto: "${textoLectura}"
      Pregunta: "${mensaje}"
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    return res.status(200).json({ respuesta: responseText });

  } catch (error) {
    console.error("Error exacto en aiController:", error);
    return res.status(500).json({ 
      respuesta: "Error en el servidor al consultar la IA.",
      detalle: error.message 
    });
  }
};