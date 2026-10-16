require('dotenv').config();
require('./config/jwt'); // falla rápido si falta JWT_SECRET
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL ? process.env.CLIENT_URL : '*',
    methods: ['GET', 'POST']
  }
});

// Hacer que 'io' esté disponible en todas las peticiones (req.io)
app.use((req, res, next) => {
  req.io = io;
  next();
});
app.use(require('./middleware/auditarMutaciones'));

// CORS: en producción define CLIENT_URL (p. ej. https://miapp.com). Sin definir, queda abierto (solo desarrollo).
app.use(cors(process.env.CLIENT_URL ? { origin: process.env.CLIENT_URL } : undefined));
app.use(express.json());

// Conexión a MongoDB
const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/asistente_lectura';
mongoose.connect(mongoURI)
  .then(() => console.log('🟢 Conexión a MongoDB exitosa'))
  .catch((err) => console.error('🔴 Error al conectar a MongoDB:', err.message));

// Rutas
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/cursos', require('./routes/cursoRoutes'));
app.use('/api/ai', require('./routes/aiRoutes'));
app.use('/api/evaluacion', require('./routes/evaluacionRoutes'));
app.use('/api/biblioteca', require('./routes/biblioteca'));
app.use('/api/progreso', require('./routes/progresoRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/reportes', require('./routes/reportRoutes'));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Puerto 5000: es el que usa el frontend (antes el valor por defecto era 5001 y no coincidía).
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
