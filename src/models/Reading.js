import mongoose from 'mongoose';

const readingSchema = new mongoose.Schema({
  titulo: { type: String, required: true },
  descripcion: { type: String, required: true },
  contenido: { type: String, required: true },
  seccion: { type: String, required: true }, // Ej. 4to A
  profesor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

export default mongoose.model('Reading', readingSchema);