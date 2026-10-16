import api from './api';

// Quita filtros vacíos para no enviar ?grado=&seccion=
const limpiar = (params) => Object.fromEntries(Object.entries(params).filter(([, v]) => v));

export const obtenerReporte = async (params) => {
  const response = await api.get('/reportes/dashboard', { params: limpiar(params) });
  return response.data;
};

export const obtenerBorradores = async (params) => (await api.get('/reportes/borradores', { params: limpiar(params) })).data;

export const obtenerNotas = async (params) => (await api.get('/reportes/notas', { params: limpiar(params) })).data;
export const obtenerHistorialNota = async (progressId) => (await api.get(`/reportes/notas/${progressId}/historial`)).data;
export const ajustarNota = async (progressId, body) => (await api.patch(`/reportes/notas/${progressId}`, body)).data;
export const restaurarNota = async (progressId, revisionId, motivo, lado = 'despues') => (
  await api.post(`/reportes/notas/${progressId}/restaurar/${revisionId}`, { motivo, lado })
).data;

export const descargarFichaObservacion = async (params) => {
  const response = await api.get('/reportes/ficha-observacion', {
    params: limpiar(params),
    responseType: 'blob',
  });
  const url = URL.createObjectURL(response.data);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `ficha_observacion_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
};
