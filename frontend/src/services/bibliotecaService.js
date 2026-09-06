import axios from 'axios';

const API_URL = 'http://localhost:5000/api/biblioteca';

export const obtenerLibros = async () => {
  const res = await axios.get(API_URL);
  return res.data;
};

export const subirPdf = async (file) => {
  const formData = new FormData();
  formData.append('pdf', file);
  const res = await axios.post(`${API_URL}/subir-pdf`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return res.data;
};

export const cambiarEstadoLibro = async (id, estado) => {
  const res = await axios.patch(`${API_URL}/cambiar-estado/${id}`, { estado });
  return res.data;
};