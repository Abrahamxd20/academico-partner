const mongoose = require('mongoose');
const { Schema } = mongoose;
const { calcularInflesz, calcularRougeL, calcularRougeS } = require('../ia/metrics');

const StudentProgressSchema = new mongoose.Schema({
  alumnoId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  readingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lectura', required: true },
  cursoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Curso', default: null, index: true },
  actividadId: { type: mongoose.Schema.Types.ObjectId, default: null },
  planVersion: { type: Number, default: null, min: 1 },

  respuestasCorrectas: { type: Number, required: true },
  totalPreguntas: { type: Number, required: true },
  tiempoEstimadoMin: { type: Number, required: true },
  tiempoRealMin: { type: Number, required: true },

  porcentajeAciertos: { type: Number },
  eficienciaTemporal: { type: Number },
  idli: { type: Number },

  nivelLiteral: {
    texto: { type: String },
    inflesz: { type: Number },
    silabasPorPalabra: { type: Number },
    palabrasPorOracion: { type: Number },
  },

  nivelInferencial: {
    respuestaReferencia: { type: String },
    respuestaAlumno: { type: String },
    rougeL: { type: Number },
    recall: { type: Number },
    precision: { type: Number },
  },

  nivelCritico: {
    respuestaReferencia: { type: String },
    respuestaAlumno: { type: String },
    rougeS: { type: Number },
    recall: { type: Number },
    precision: { type: Number },
  },

  subrayados: { type: Object },
  // Ajustes autorizados quedan separados de las métricas calculadas originales.
  notaAjustada: { type: Schema.Types.Mixed, default: {} },
  fecha: { type: Date, default: Date.now },
});

StudentProgressSchema.index({ fecha: -1 });
StudentProgressSchema.index({ alumnoId: 1, fecha: -1 });
StudentProgressSchema.index({ readingId: 1, fecha: -1 });
StudentProgressSchema.index({ cursoId: 1, planVersion: 1, fecha: -1 });

StudentProgressSchema.pre('save', function (next) {
  this.porcentajeAciertos = (this.respuestasCorrectas / this.totalPreguntas) * 100;
  this.eficienciaTemporal = (this.tiempoEstimadoMin / this.tiempoRealMin) * 100;
  this.idli = (this.porcentajeAciertos * 0.70) + (this.eficienciaTemporal * 0.30);

  if (this.nivelLiteral && this.nivelLiteral.texto) {
    const r = calcularInflesz(this.nivelLiteral.texto);
    this.nivelLiteral.inflesz = r.inflesz;
    this.nivelLiteral.silabasPorPalabra = r.P;
    this.nivelLiteral.palabrasPorOracion = r.F;
  }

  if (this.nivelInferencial && this.nivelInferencial.respuestaReferencia && this.nivelInferencial.respuestaAlumno) {
    const r = calcularRougeL(this.nivelInferencial.respuestaReferencia, this.nivelInferencial.respuestaAlumno);
    this.nivelInferencial.rougeL = r.rougeL;
    this.nivelInferencial.recall = r.Rlcs;
    this.nivelInferencial.precision = r.Plcs;
  }

  if (this.nivelCritico && this.nivelCritico.respuestaReferencia && this.nivelCritico.respuestaAlumno) {
    const r = calcularRougeS(this.nivelCritico.respuestaReferencia, this.nivelCritico.respuestaAlumno);
    this.nivelCritico.rougeS = r.rougeS;
    this.nivelCritico.recall = r.Rskip2;
    this.nivelCritico.precision = r.Pskip2;
  }

  next();
});

module.exports = mongoose.model('StudentProgress', StudentProgressSchema, 'studentprogresses');
