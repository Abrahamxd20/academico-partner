import api from './api';

export const obtenerResumenDashboard = async () => {
  const response = await api.get('/dashboard/resumen');
  return response.data;
};

export const obtenerResumenPorLectura = async () => {
  const response = await api.get('/dashboard/por-lectura');
  return response.data;
};

export const obtenerActividadAlumnos = async () => {
  const response = await api.get('/dashboard/todos');
  return response.data;
};
