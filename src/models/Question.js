import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  lecturaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Reading', required: true },
  enunciado: { type: String, required: true },
  opciones: [{ type: String, required: true }], // Array de 4 opciones
  respuestaCorrecta: { type: Number, required: true } // Índice de la opción correcta (0, 1, 2 o 3)
}, { timestamps: true });

export default mongoose.model('Question', questionSchema);