import axios from 'axios';
import { API_BASE_URL } from '../config';
const API = axios.create({
 baseURL: `${API_BASE_URL}/api`,
});

// Interceptor para adjuntar el Token JWT en cada petición HTTP
API.interceptors.request.use((config) => {
  const user = localStorage.getItem('userInfo');
  if (user) {
    const { token } = JSON.parse(user);
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default API;