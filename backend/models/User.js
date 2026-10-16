const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  apellido: { type: String, required: true, trim: true },

  username: { type: String, required: true, unique: true },

  // DNI de 8 dígitos (prototipo RF-02). Índice único "sparse": los usuarios antiguos que aún no lo tienen no chocan entre sí.
  dni: { type: String, unique: true, sparse: true, trim: true, match: /^\d{8}$/ },

  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true }, // se guarda ya cifrada (bcrypt)

  rol: {
    type: String,
    enum: ['alumno', 'docente', 'admin'],
    default: 'alumno',
  },

  grado: { type: String },
  seccion: { type: String },

  // Configuración pedagógica del docente (pantalla Configuración). Solo la usan docentes/admin.
  configDocente: {
    institucion: { type: String, trim: true, maxlength: 200, default: '' },
    tiempoMaxEval: { type: Number, min: 1, max: 180, default: 10 },
    umbralAprobacion: { type: Number, min: 0, max: 100, default: 60 },
    nivelEducativo: { type: String, enum: ['Primaria', 'Secundaria', 'Bachillerato', 'Universitario'], default: 'Secundaria' },
    cantPreguntasIA: { type: Number, min: 1, max: 10, default: 3 },
    estrategiaDefault: [{ type: String }],
  },

  // RF-03: eliminación lógica (equivale al "estado 1/0" del documento Scrum). Los usuarios antiguos sin este campo cuentan como activos.
  activo: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);