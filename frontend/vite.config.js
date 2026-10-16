import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  // Permite abrir el frontend desde un celular conectado a la misma red Wi-Fi.
  server: {
    host: '0.0.0.0',
    strictPort: true,
    allowedHosts: ['.devtunnels.ms'],
    proxy: {
      '/api': { target: 'http://127.0.0.1:5000' },
      '/uploads': { target: 'http://127.0.0.1:5000' },
    },
  },
})
