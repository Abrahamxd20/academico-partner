import API from './api';
import { API_BASE_URL } from '../config';

// Envía los datos de progreso del alumno al backend (envío FINAL de la evaluación)
export const guardarProgreso = async (payload) => {
  // Asume que la ruta de progreso está bajo /progreso como definido en backend/routes/progresoRoutes.js
  const response = await API.post('/progreso', payload);
  return response.data;
};

// Recupera el avance en curso del alumno en una lectura: { yaEnviado, borrador | null }
export const obtenerBorrador = async (readingId) => {
  const response = await API.get(`/progreso/borrador/${readingId}`);
  return response.data;
};

// Autoguardado del avance en curso (crea o sobrescribe el borrador)
export const guardarBorrador = async (readingId, payload) => {
  const response = await API.put(`/progreso/borrador/${readingId}`, payload);
  return response.data;
};

// Igual que guardarBorrador, pero sobrevive al cierre/recarga de la página (fetch + keepalive).
// Se usa en "pagehide" y al salir de la pantalla, donde una petición normal de axios se cancelaría.
export const guardarBorradorKeepalive = (readingId, payload) => {
  try {
    const { token } = JSON.parse(localStorage.getItem('userInfo') || '{}');
    if (!token) return;
    fetch(`${API_BASE_URL}/api/progreso/borrador/${readingId}`, {
      method: 'PUT',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {
    /* sin token o JSON inválido: no hay nada que guardar */
  }
};
