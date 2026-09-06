const mongoose = require('mongoose');

const libroSchema = new mongoose.Schema({
  usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  titulo: { type: String, required: true },
  autor: { type: String, default: 'Autor desconocido' },
  genero: { type: String, default: 'General' },
  urlPdf: { type: String, required: true },
  estado: { 
    type: String, 
    enum: ['Por leer', 'Leyendo', 'Leído'], 
    default: 'Por leer' 
  },
  paginasLeidas: { type: Number, default: 0 },
  totalPaginas: { type: Number, default: 1 }
}, { timestamps: true });

module.exports = mongoose.model('Libro', libroSchema);