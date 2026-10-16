import api from './api';

// Lista de lecturas en PDF. El alumno solo ve las 'Publicado';
// el docente ve además las 'Archivado' (para poder gestionarlas).
export const obtenerLibros = async () => {
  const res = await api.get('/biblioteca');
  return res.data;
};

// Solo docente/admin (el backend lo valida igual).
export const subirLecturaPdf = async ({ file, titulo, autor, categoria }) => {
  const formData = new FormData();
  formData.append('pdf', file);
  if (titulo) formData.append('titulo', titulo);
  if (autor) formData.append('autor', autor);
  if (categoria) formData.append('categoria', categoria);

  const res = await api.post('/biblioteca/subir-pdf', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

export const cambiarEstadoLectura = async (id, estado) => {
  const res = await api.patch(`/biblioteca/${id}/estado`, { estado });
  return res.data;
};

export const eliminarLectura = async (id) => {
  const res = await api.delete(`/biblioteca/${id}`);
  return res.data;
};

// Pide a la IA que genere preguntas extrayendo el texto del PDF de la lectura.
export const generarPreguntasIA = async (id) => {
  const res = await api.post(`/biblioteca/${id}/generar-preguntas`);
  return res.data; // { mensaje, preguntas }
};

// Guarda las preguntas editadas por el docente.
export const guardarPreguntas = async (id, payload) => {
  const res = await api.put(`/biblioteca/${id}/preguntas`, payload);
  return res.data;
};
export const actualizarLectura = async (id, payload) => {
  const res = await api.put(/biblioteca/ + id, payload);
  return res.data;
};
