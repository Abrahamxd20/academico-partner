import api from './api';

const base = (id) => `/cursos/${id}`;

export const listarCursos = async () => (await api.get('/cursos')).data;
export const obtenerCurso = async (id) => (await api.get(base(id))).data;
export const crearCurso = async (d) => (await api.post('/cursos', d)).data;
export const actualizarCurso = async (id, d) => (await api.put(base(id), d)).data;
export const eliminarCurso = async (id) => (await api.delete(base(id))).data;

// Las operaciones de sesiones/actividades devuelven el curso completo ya actualizado.
export const crearSesion = async (id, d) => (await api.post(`${base(id)}/sesiones`, d)).data;
export const actualizarSesion = async (id, sid, d) => (await api.put(`${base(id)}/sesiones/${sid}`, d)).data;
export const eliminarSesion = async (id, sid) => (await api.delete(`${base(id)}/sesiones/${sid}`)).data;

export const crearActividad = async (id, sid, d) => (await api.post(`${base(id)}/sesiones/${sid}/actividades`, d)).data;
export const actualizarActividad = async (id, sid, aid, d) => (await api.put(`${base(id)}/sesiones/${sid}/actividades/${aid}`, d)).data;
export const eliminarActividad = async (id, sid, aid) => (await api.delete(`${base(id)}/sesiones/${sid}/actividades/${aid}`)).data;

// Lecturas disponibles para el selector de actividades (solo docente)
export const listarLecturas = async () => (await api.get('/biblioteca')).data;
