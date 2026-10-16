const API_CONFIGURADA = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const API_ES_LOCALHOST = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(API_CONFIGURADA);
const HOST_PUBLICO_DEV_TUNNEL = typeof window !== 'undefined'
  && window.location.hostname.endsWith('.devtunnels.ms');

// Si el frontend se abre desde un celular en la misma red, "localhost" sería
// el propio celular. Conserva el puerto del backend y usa el host de la página.
// En Dev Tunnels se usa el proxy de Vite para que el backend siga siendo local.
export const API_BASE_URL = HOST_PUBLICO_DEV_TUNNEL
  ? ''
  : typeof window !== 'undefined'
  && API_ES_LOCALHOST
  && !['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? `${window.location.protocol}//${window.location.hostname}:${new URL(API_CONFIGURADA).port || '5000'}`
  : API_CONFIGURADA;
