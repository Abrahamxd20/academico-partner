import api from './api';

// Obtiene el perfil completo del usuario autenticado
export const obtenerPerfil = async () => {
  const res = await api.get('/auth/me');
  return res.data;
};

// Actualiza nombre, apellido, email y opcionalmente la contraseña
export const actualizarPerfil = async (datos) => {
  const res = await api.put('/auth/me', datos);
  return res.data; // { message, user }
};

// Guarda la configuración pedagógica del docente
export const actualizarConfigDocente = async (config) => {
  const res = await api.put('/auth/me/config', config);
  return res.data; // { message, configDocente }
};
