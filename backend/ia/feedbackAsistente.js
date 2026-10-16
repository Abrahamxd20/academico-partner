function feedbackLiteral(inflesz) {
  if (inflesz === undefined || inflesz === null || isNaN(inflesz)) {
    return 'Aún no tengo suficiente texto tuyo para darte una observación sobre esta parte.';
  }
  if (inflesz >= 80) return 'Explicaste el texto con tus propias palabras de forma clara y sencilla. Se nota que entendiste bien lo que leíste literalmente.';
  if (inflesz >= 60) return 'Tu explicación del texto es bastante clara. Hay algunas frases un poco largas o complejas, pero se entiende bien lo que quisiste decir.';
  if (inflesz >= 40) return 'Tu explicación tiene ideas correctas, pero está redactada de forma algo compleja. Intenta usar oraciones más cortas y palabras más simples.';
  return 'Noto que tu explicación usa oraciones largas y palabras complejas. Vuelve a leer el texto con calma y cuenta, de forma simple, qué fue lo que pasó o de qué trata.';
}

function feedbackInferencial(rougeL) {
  if (rougeL === undefined || rougeL === null || isNaN(rougeL)) {
    return 'Todavía no puedo darte una observación sobre esta parte, falta tu respuesta.';
  }
  if (rougeL >= 0.5) return 'Tu respuesta conecta muy bien con las ideas importantes del texto. ¡Buen trabajo interpretando!';
  if (rougeL >= 0.3) return 'Tu respuesta va por buen camino y toca varias ideas relevantes del texto, pero podrías profundizar más.';
  if (rougeL >= 0.15) return 'Tu respuesta se relaciona parcialmente con el texto. Te recomiendo releer el fragmento relacionado con la pregunta.';
  return 'Tu respuesta se aleja bastante de las ideas del texto. Vuelve a leer el fragmento e intenta pensar "¿qué me está queriendo decir el texto aquí?".';
}

function feedbackCritico(rougeS) {
  if (rougeS === undefined || rougeS === null || isNaN(rougeS)) {
    return 'Todavía no puedo darte una observación sobre esta parte, falta tu respuesta.';
  }
  if (rougeS >= 0.35) return 'Tu análisis conecta varias ideas del texto entre sí de forma sólida. Se nota una reflexión crítica bien construida.';
  if (rougeS >= 0.2) return 'Tu análisis tiene una buena base. Para fortalecerlo, intenta vincular más de una idea o ejemplo del texto en tu argumento.';
  if (rougeS >= 0.1) return 'Tu reflexión toca el tema, pero se apoya en pocas ideas del texto. Justifica tu opinión conectando dos o más partes de la lectura.';
  return 'Tu respuesta parece más una opinión general que un análisis basado en el texto. Apoya tu punto de vista con al menos dos ideas concretas de la lectura.';
}

function generarAcompañamiento({ inflesz, rougeL, rougeS }) {
  return {
    literal: feedbackLiteral(inflesz),
    inferencial: feedbackInferencial(rougeL),
    critico: feedbackCritico(rougeS),
  };
}

module.exports = { feedbackLiteral, feedbackInferencial, feedbackCritico, generarAcompañamiento };