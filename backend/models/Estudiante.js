const mongoose = require('mongoose');

const EstudianteSchema = new mongoose.Schema({
  codigoEstudiante: { type: String, required: true, unique: true },
  sesiones: [
    {
      fecha: { type: Date, default: Date.now },
      tiempoEmpleadoMinutos: Number,
      tiempoIdealMinutos: Number,
      tareasAsignadas: Number,
      tareasCompletadas: Number,
      metricas: {
        porcentajeAciertos: Number,
        notaVigesimal: Number,
        tasaCumplimiento: Number,
        notaTiempo: Number,
        DLI: Number
      }
    }
  ]
});

module.exports = mongoose.model('Estudiante', EstudianteSchema);