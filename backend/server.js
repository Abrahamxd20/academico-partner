require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Importar Archivos de Rutas
const aiRoutes = require('./routes/aiRoutes');
const evaluacionRoutes = require('./routes/evaluacionRoutes');
const bibliotecaRoutes = require('./routes/biblioteca');

// Registrar Middlewares de Rutas
app.use('/api/ai', aiRoutes);
app.use('/api/evaluacion', evaluacionRoutes);
app.use('/api/biblioteca', bibliotecaRoutes);

app.use('/uploads', express.static('uploads'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});