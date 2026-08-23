import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import readingRoutes from './routes/readingRoutes.js';

dotenv.config();
connectDB();

const app = express();

// Middlewares principales (SIEMPRE antes de las rutas)
app.use(cors());
app.use(express.json());

// Ruta de prueba para la raíz del navegador
app.get('/', (req, res) => {
  res.json({ mensaje: '¡Servidor Backend de Asistente de Lectura activo!' });
});

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/readings', readingRoutes);
app.use('/api/teacher', teacherRoutes); // 2. REGISTRAR RUTAS DEL PROFESOR

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[Server] Servidor backend ejecutándose en el puerto ${PORT}`);
});