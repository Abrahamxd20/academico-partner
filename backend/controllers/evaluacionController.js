const { GoogleGenerativeAI } = require('@google/generative-ai');
const Estudiante = require('../models/Estudiante');

exports.evaluarRespuestaIA = async (req, res) => {
  try {
    const { 
      codigoEstudiante, 
      preguntaTexto, 
      respuestaEstudiante, 
      criterioEvaluacion,
      tiempoEmpleado,
      tiempoIdeal,
      tareasCompletadas,
      tareasAsignadas
    } = req.body;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("No se encontró la clave GEMINI_API_KEY");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // ✅ NOMBRE CORRECTO DEL MODELO
    const model = genAI.getGenerativeModel({ 
      model: "gemini-flash-latest",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `Actúa como un tutor educado, amable y conversacional para estudiantes de secundaria.

Contexto de la lectura:
Pregunta: "${preguntaTexto}"
Criterio esperado: "${criterioEvaluacion}"
Mensaje del alumno: "${respuestaEstudiante}"

Instrucciones:
1. Si el usuario envía un saludo (ej: "hola", "buenos días"), responde con un saludo amigable, mantén esCorrecta como false y guíalo a responder la pregunta.
2. Si intenta responder la pregunta, evalúa su comprensión.

Responde ÚNICAMENTE en formato JSON estricto con las claves "esCorrecta" (boolean) y "retroalimentacion" (string).`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const evaluacionIA = JSON.parse(responseText);

    const esCorrecta = Boolean(evaluacionIA.esCorrecta);
    const porcentajeAciertos = esCorrecta ? 100 : 0;
    const notaVigesimal = esCorrecta ? 20 : 0;
    const tasaCumplimiento = (tareasCompletadas / (tareasAsignadas || 1)) * 100;
    
    let notaTiempo = ((tiempoIdeal || 10) / (tiempoEmpleado || 1)) * 20;
    if (notaTiempo > 20) notaTiempo = 20;
    const DLI = (notaVigesimal * 0.60) + (notaTiempo * 0.40);

    const nuevaSesion = {
      tiempoEmpleadoMinutos: tiempoEmpleado,
      tiempoIdealMinutos: tiempoIdeal,
      tareasAsignadas,
      tareasCompletadas,
      metricas: {
        porcentajeAciertos,
        notaVigesimal,
        tasaCumplimiento,
        notaTiempo,
        DLI
      }
    };

    if (codigoEstudiante) {
      await Estudiante.findOneAndUpdate(
        { codigoEstudiante },
        { $push: { sesiones: nuevaSesion } },
        { new: true, upsert: true }
      );
    }

    res.status(200).json({
      evaluacion: evaluacionIA,
      dimensiones: nuevaSesion.metricas
    });

  } catch (error) {
    console.error("Error en evaluacionController:", error.message);
    res.status(500).json({ 
      error: "Error en la evaluación con Gemini", 
      detalle: error.message 
    });
  }
};