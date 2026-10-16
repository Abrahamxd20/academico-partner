const mongoose = require('mongoose');

// Documento de lectura en PDF. Antes lo subía el alumno (biblioteca personal);
// ahora lo sube el docente y el alumno solo lo visualiza (solo lectura).
const libroSchema = new mongoose.Schema({
  titulo: { type: String, required: true, trim: true },
  autor: { type: String, trim: true, default: '' },
  categoria: { type: String, trim: true, default: 'General' },

  pdfUrl: { type: String, required: true },       // ruta pública: /uploads/archivo.pdf
  nombreArchivo: { type: String },                 // nombre original del PDF
  tamanioKB: { type: Number },

  subidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Visibilidad para el alumno: 'Publicado' (visible) | 'Archivado' (oculto)
  estado: { type: String, enum: ['Publicado', 'Archivado'], default: 'Publicado' },
}, { timestamps: true }); // createdAt = fecha de subida, usada para el historial

module.exports = mongoose.model('Libro', libroSchema);
