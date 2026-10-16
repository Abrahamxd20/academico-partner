const mongoose = require('mongoose');

// Rúbrica: criterios, cada uno con sus niveles de logro (ej.: Logrado 4 pts, En proceso 2 pts, Inicio 0 pts).
const criterioSchema = new mongoose.Schema({
  codigo: { type: String, trim: true, default: '' },
  nombre: { type: String, trim: true, required: true },
  objetivo: { type: String, trim: true, default: '' },
  niveles: [{
    nombre: { type: String, trim: true, required: true },
    puntos: { type: Number, min: 0, default: 0 },
    descriptor: { type: String, trim: true, default: '' },
    _id: false,
  }],
}, { _id: false });

// Actividad = una lectura de la biblioteca asignada dentro de una sesión.
const actividadSchema = new mongoose.Schema({
  lectura: { type: mongoose.Schema.Types.ObjectId, ref: 'Lectura', required: true },
  titulo: { type: String, trim: true, default: '' },          // opcional: por defecto se usa el de la lectura
  instrucciones: { type: String, trim: true, default: '' },
  objetivoAprendizaje: { type: String, trim: true, default: '' },
  etapa: { type: String, enum: ['introduccion', 'explicacion', 'practica', 'comprobacion'], default: 'practica' },
  tipoEvidencia: { type: String, enum: ['respuestas', 'palabras_clave', 'resumen', 'respuesta_abierta'], default: 'respuestas' },
  peso: { type: Number, min: 0, max: 100, default: 100 },
  fechaEntrega: { type: Date, default: null },
  visible: { type: Boolean, default: true },                  // oculta = el alumno no la ve
  rubrica: { criterios: { type: [criterioSchema], default: [] } },
}, { timestamps: true });

// Sesión = "carpeta" del curso con sus actividades.
const sesionSchema = new mongoose.Schema({
  titulo: { type: String, trim: true, required: true },
  temas: { type: String, trim: true, default: '' },
  objetivoAprendizaje: { type: String, trim: true, default: '' },
  fechaProgramada: { type: Date, default: null },
  visible: { type: Boolean, default: true },
  actividades: { type: [actividadSchema], default: [] },
}, { timestamps: true });

// Un curso = "Comprensión lectora" de un grado y sección (ej.: 4to A) a cargo de un docente.
// La matrícula es la lista de alumnos (referencias a User).
const cursoSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  descripcion: { type: String, trim: true, default: '' },
  institucion: { type: String, trim: true, default: '', maxlength: 180 },
  areaCurricular: { type: String, trim: true, default: '', maxlength: 120 },
  referenciaCurricular: { type: String, trim: true, default: '', maxlength: 300 },
  competencias: { type: [String], default: [] },
  programacionCurricular: { type: String, trim: true, default: '', maxlength: 8000 },
  grado: { type: String, required: true, trim: true },   // mismo formato que User.grado ("4to")
  seccion: { type: String, required: true, trim: true }, // mismo formato que User.seccion ("A")
  docente: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  alumnos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  sesiones: { type: [sesionSchema], default: [] },
  activo: { type: Boolean, default: true }, // eliminación lógica, igual que en los usuarios
  planVersion: { type: Number, default: 1 },
}, { timestamps: true });

cursoSchema.index({ docente: 1, grado: 1, seccion: 1 });
cursoSchema.index({ alumnos: 1 });

module.exports = mongoose.model('Curso', cursoSchema, 'cursos');
