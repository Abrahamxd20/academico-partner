// Copia los documentos antiguos de la colección "libros" a "lecturas" (una sola vez).
// Es seguro ejecutarlo varias veces: omite los que ya fueron migrados.
//   uso:  node scripts/migrarLibros.js
require('dotenv').config();
const mongoose = require('mongoose');
const Libro = require('../models/Libro');
const Lectura = require('../models/Lectura');

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/asistente_lectura');
  const libros = await Libro.find().lean();
  let migrados = 0;

  for (const l of libros) {
    if (await Lectura.exists({ pdfUrl: l.pdfUrl })) continue;
    await Lectura.create({
      titulo: l.titulo, autor: l.autor, categoria: l.categoria,
      pdfUrl: l.pdfUrl, nombreArchivo: l.nombreArchivo, tamanioKB: l.tamanioKB,
      subidoPor: l.subidoPor, estado: l.estado,
      createdAt: l.createdAt,
    });
    migrados++;
  }
  console.log(`✅ ${migrados} lectura(s) migrada(s) de ${libros.length} libro(s).`);
  await mongoose.disconnect();
})().catch((e) => { console.error('🔴', e.message); process.exit(1); });
