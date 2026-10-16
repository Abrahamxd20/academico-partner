const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { protect, soloDocente } = require('../middleware/authMiddleware');
const bibliotecaController = require('../controllers/bibliotecaController');

const CARPETA_UPLOADS = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(CARPETA_UPLOADS, { recursive: true }); // evita ENOENT si 'uploads/' no existe aún

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CARPETA_UPLOADS),
  filename: (req, file, cb) => cb(null, `${Date.now()}${path.extname(file.originalname)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Solo se permiten archivos PDF'));
    }
    cb(null, true);
  },
});

// Todas las rutas requieren estar autenticado.
router.use(protect);

// Alumnos y docentes pueden ver el historial de lecturas.
router.get('/', bibliotecaController.listar);

// Lo que ve el alumno al abrir una actividad: texto y preguntas de ESA lectura.
router.get('/:id/actividad', bibliotecaController.obtenerActividad);

// Solo el docente/admin puede subir, archivar o eliminar lecturas.
router.post('/subir-pdf', soloDocente, upload.single('pdf'), bibliotecaController.subirPdf);
router.patch('/:id/estado', soloDocente, bibliotecaController.cambiarEstado);
router.delete('/:id', soloDocente, bibliotecaController.eliminar);

// Generación y edición de preguntas con IA (solo docente/admin)
router.post('/:id/generar-preguntas', soloDocente, bibliotecaController.generarPreguntas);
router.put('/:id/preguntas', soloDocente, bibliotecaController.guardarPreguntas);
router.put('/:id', soloDocente, bibliotecaController.actualizarDatosLectura);

// Manejo de errores propios de Multer (tamaño excedido, tipo de archivo, etc.)
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError || error) {
    return res.status(400).json({ mensaje: error.message || 'Error al procesar el archivo' });
  }
  next();
});

module.exports = router;