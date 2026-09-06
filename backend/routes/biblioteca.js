const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Libro = require('../models/Libro');

// Configuración de almacenamiento local para PDFs
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Subir PDF y sumar 2 puntos
router.post('/subir-pdf', upload.single('pdf'), async (req, res) => {
  try {
    const nuevoLibro = new Libro({
      titulo: req.file.originalname.replace('.pdf', ''),
      urlPdf: `/uploads/${req.file.filename}`,
      estado: 'Por leer'
    });
    await nuevoLibro.save();
    res.json({ mensaje: 'Libro subido con éxito (+2 pts)', libro: nuevoLibro });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cambiar estado a "Leyendo" o "Leído"
router.patch('/cambiar-estado/:id', async (req, res) => {
  try {
    const { estado } = req.body;
    const libroActualizado = await Libro.findByIdAndUpdate(
      req.params.id, 
      { estado }, 
      { new: true }
    );
    res.json(libroActualizado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;