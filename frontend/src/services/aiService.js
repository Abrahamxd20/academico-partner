import api from './api';

export const enviarMensajeChat = async (mensaje, textoLectura, tipoConsulta, historial = [], contextoPedagogico = null) => {
  try {
    const response = await api.post('/ai/chat', {
      mensaje,
      textoLectura,
      tipoConsulta,
      historial,
      contextoPedagogico,
    });
    return response.data;
  } catch (error) {
    console.error('Error en aiService:', error);
    throw error;
  }
};
