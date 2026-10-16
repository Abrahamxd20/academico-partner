const fs = require('fs');
const path = require('path');
const Lectura = require('../models/Lectura');
const { leerPdfComoParrafos } = require('../ia/textoPdf');
const { extraerTextoPdf, generarPreguntasConIA } = require('../ia/generadorPreguntas');
const { registrarAccion } = require('../utils/auditoria');

const SOLO_PDF = { pdfUrl: { $exists: true, $ne: '' } };

// Nunca se envían al alumno las respuestas de referencia ni las claves.
const OCULTAR_AL_ALUMNO =
  '-preguntaInferencial.respuestaReferencia -preguntaCritico.respuestaReferencia -preguntasOpcionMultiple.respuestaCorrecta';

const esDocente = (req) =>
  ['docente', 'profesor', 'admin'].includes((req.user?.rol || '').toLowerCase());

// GET /api/biblioteca
// Alumno: solo 'Publicado'. Docente/admin: todo (incluye 'Archivado' y 'Borrador').
exports.listar = async (req, res) => {
  try {
    const docente = esDocente(req);
    const consulta = Lectura.find(docente ? SOLO_PDF : { ...SOLO_PDF, estado: { $nin: ['Archivado', 'Borrador'] } })
      .populate('subidoPor', 'nombre')
      .sort({ createdAt: -1 });
    if (!docente) consulta.select(OCULTAR_AL_ALUMNO);

    res.json(await consulta);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al listar las lecturas', error: error.message });
  }
};

// POST /api/biblioteca/subir-pdf  (multipart: pdf, titulo?, autor?, categoria?)
exports.subirPdf = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ mensaje: 'No se recibió ningún archivo PDF' });
    }

    const nombreBase = req.file.originalname.replace(/\.pdf$/i, '');
    const rutaPdf = `/uploads/${req.file.filename}`;

    // Texto real del PDF: es lo que verá el alumno en la pestaña Lectura.
    // Si el PDF es una imagen escaneada no hay texto que extraer: la lectura se crea igual.
    let parrafos = [];
    let minutos = 5;
    try {
      const leido = await leerPdfComoParrafos(rutaPdf);
      parrafos = leido.parrafos;
      minutos = leido.minutos;
    } catch (e) {
      console.error('[subirPdf] No se pudo extraer el texto del PDF:', e.message);
    }

    const nueva = await Lectura.create({
      titulo: (req.body.titulo || nombreBase).trim(),
      autor: req.body.autor || '',
      categoria: req.body.categoria || 'General',
      pdfUrl: rutaPdf,
      parrafos,
      tiempoEstimadoMin: minutos,
      tiempoEstimado: `${minutos} min`,
      nombreArchivo: req.file.originalname,
      tamanioKB: Math.round(req.file.size / 1024),
      subidoPor: req.user?.id,
      estado: 'Publicado', // HU5 lo cambiará a 'Borrador' hasta asignar una estrategia
    });

    const poblada = await nueva.populate('subidoPor', 'nombre');
    await registrarAccion(req, { action: 'lectura.creada', entity: 'Lectura', entityId: nueva._id, details: { titulo: nueva.titulo, archivo: nueva.nombreArchivo, tamanioKB: nueva.tamanioKB } });

    // NOTIFICACIÓN EN TIEMPO REAL:
    // Usamos req.io que configuramos en server.js para avisar a todos los alumnos
    if (req.io) {
      req.io.emit('nueva-lectura', poblada);
    }

    res.status(201).json({
      mensaje: parrafos.length
        ? 'Lectura subida con éxito'
        : 'Lectura subida, pero no se pudo extraer texto del PDF (¿es una imagen escaneada?)',
      libro: poblada,
    });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al subir la lectura', error: error.message });
  }
};

// PATCH /api/biblioteca/:id/estado   body: { estado }
exports.cambiarEstado = async (req, res) => {
  try {
    const { estado } = req.body;
    if (!['Publicado', 'Archivado'].includes(estado)) {
      return res.status(400).json({ mensaje: 'Estado inválido' });
    }
    const lectura = await Lectura.findByIdAndUpdate(req.params.id, { estado }, { new: true })
      .populate('subidoPor', 'nombre');
    if (!lectura) return res.status(404).json({ mensaje: 'Lectura no encontrada' });
    await registrarAccion(req, { action: 'lectura.estado.cambiado', entity: 'Lectura', entityId: lectura._id, details: { estado } });
    res.json(lectura);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al actualizar el estado', error: error.message });
  }
};

// DELETE /api/biblioteca/:id — elimina el registro y el archivo físico.
exports.eliminar = async (req, res) => {
  try {
    const lectura = await Lectura.findByIdAndDelete(req.params.id);
    if (!lectura) return res.status(404).json({ mensaje: 'Lectura no encontrada' });
    await registrarAccion(req, { action: 'lectura.eliminada', entity: 'Lectura', entityId: lectura._id, details: { titulo: lectura.titulo, archivo: lectura.nombreArchivo } });

    if (lectura.pdfUrl) {
      fs.unlink(path.join(__dirname, '..', lectura.pdfUrl), () => {});
    }
    res.json({ mensaje: 'Lectura eliminada' });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al eliminar la lectura', error: error.message });
  }
};

// PUT /api/biblioteca/:id   body: { titulo, autor, categoria, tipo, estrategias, estado }
exports.actualizarDatosLectura = async (req, res) => {
  try {
    const permitidos = ['titulo', 'autor', 'categoria', 'tipo', 'tiempoEstimado', 'tiempoEstimadoMin', 'estrategias', 'estado'];
    const cambios = {};
    for (const campo of permitidos) {
      if (req.body[campo] !== undefined) cambios[campo] = req.body[campo];
    }
    const lectura = await Lectura.findByIdAndUpdate(req.params.id, cambios, { new: true, runValidators: true })
      .populate('subidoPor', 'nombre');
    if (!lectura) return res.status(404).json({ mensaje: 'Lectura no encontrada' });
    await registrarAccion(req, { action: 'lectura.actualizada', entity: 'Lectura', entityId: lectura._id, details: { campos: Object.keys(cambios) } });
    res.json(lectura);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al actualizar la lectura', error: error.message });
  }
};

// PUT /api/biblioteca/:id/preguntas
// body: { preguntasOpcionMultiple, preguntaLiteral, preguntaInferencial, preguntaCritico }
exports.guardarPreguntas = async (req, res) => {
  try {
    const { preguntasOpcionMultiple, preguntaLiteral, preguntaInferencial, preguntaCritico } = req.body;
    const cambios = {};
    if (preguntasOpcionMultiple !== undefined) cambios.preguntasOpcionMultiple = preguntasOpcionMultiple;
    if (preguntaLiteral !== undefined) cambios.preguntaLiteral = preguntaLiteral;
    if (preguntaInferencial !== undefined) cambios.preguntaInferencial = preguntaInferencial;
    if (preguntaCritico !== undefined) cambios.preguntaCritico = preguntaCritico;

    const lectura = await Lectura.findByIdAndUpdate(req.params.id, cambios, { new: true, runValidators: true });
    if (!lectura) return res.status(404).json({ mensaje: 'Lectura no encontrada' });
    await registrarAccion(req, { action: 'lectura.preguntas.actualizadas', entity: 'Lectura', entityId: lectura._id, details: { preguntas: Array.isArray(cambios.preguntasOpcionMultiple) ? cambios.preguntasOpcionMultiple.length : undefined, niveles: Object.keys(cambios).filter((key) => key !== 'preguntasOpcionMultiple') } });

    // Los alumnos que tengan abierta esta lectura la recargan con las preguntas nuevas.
    if (req.io) req.io.emit('lectura-actualizada', { id: String(lectura._id) });

    res.json(lectura);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al guardar las preguntas', error: error.message });
  }
};

// POST /api/biblioteca/:id/generar-preguntas
exports.generarPreguntas = async (req, res) => {
  try {
    const lectura = await Lectura.findById(req.params.id);
    if (!lectura) return res.status(404).json({ mensaje: 'Lectura no encontrada' });
    if (['Archivado', 'Borrador'].includes(lectura.estado)) {
      return res.status(409).json({ mensaje: 'Publica el recurso antes de generar sus preguntas' });
    }

    let texto = (lectura.parrafos || []).join('\n\n').trim();
    if (texto.length < 200 && lectura.pdfUrl) {
      try { texto = (await extraerTextoPdf(lectura.pdfUrl)).trim(); }
      catch (error) {
        console.error('[biblioteca] No se pudo leer el PDF para generar preguntas:', error.message);
        return res.status(422).json({ mensaje: 'No se pudo extraer texto del PDF. Sube un PDF con texto seleccionable.' });
      }
    }
    if (texto.length < 200) {
      return res.status(422).json({ mensaje: 'El recurso necesita al menos 200 caracteres de texto para generar preguntas.' });
    }

    const generado = await generarPreguntasConIA(texto);
    lectura.preguntasOpcionMultiple = generado.preguntasOpcionMultiple;
    lectura.preguntaLiteral = generado.preguntaLiteral;
    lectura.preguntaInferencial = generado.preguntaInferencial;
    lectura.preguntaCritico = generado.preguntaCritico;
    if (!lectura.parrafos?.length) {
      const { textoAParrafos } = require('../ia/textoPdf');
      lectura.parrafos = textoAParrafos(texto);
    }
    await lectura.save();
    await registrarAccion(req, {
      action: 'lectura.preguntas.generadas', entity: 'Lectura', entityId: lectura._id,
      details: { cantidad: generado.preguntasOpcionMultiple.length, niveles: ['literal', 'inferencial', 'critico'] },
    });
    if (req.io) req.io.emit('lectura-actualizada', { id: String(lectura._id) });
    return res.json({ mensaje: 'Preguntas generadas y guardadas', preguntas: generado, lecturaId: lectura._id });
  } catch (error) {
    console.error('[biblioteca] Error generando preguntas:', error.message);
    return res.status(502).json({ mensaje: 'No se pudieron generar las preguntas con IA. Revisa que el servicio esté configurado y vuelve a intentarlo.' });
  }
};

// GET /api/biblioteca/:id/actividad
// Lo que ve el alumno al abrir una actividad: el texto y las preguntas de ESA lectura.
// (Nunca se envían las respuestas de referencia de las preguntas abiertas.)
exports.obtenerActividad = async (req, res) => {
  try {
    console.log(`[actividad] pedida lectura id=${req.params.id} por usuario=${req.user?.id} rol=${req.user?.rol}`);
    const lectura = await Lectura.findById(req.params.id);
    if (!lectura) return res.status(404).json({ mensaje: 'Lectura no encontrada' });

    if (!esDocente(req) && ['Archivado', 'Borrador'].includes(lectura.estado)) {
      return res.status(404).json({ mensaje: 'Esta lectura no está disponible' });
    }

    // Lecturas subidas antes de que se extrajera el texto: se completa al abrirlas.
    if (!lectura.parrafos?.length && lectura.pdfUrl) {
      try {
        const leido = await leerPdfComoParrafos(lectura.pdfUrl);
        if (leido.parrafos.length) {
          lectura.parrafos = leido.parrafos;
          lectura.tiempoEstimadoMin = leido.minutos;
          lectura.tiempoEstimado = `${leido.minutos} min`;
          await lectura.save();
        }
      } catch (e) {
        console.error('[obtenerActividad] No se pudo extraer el texto del PDF:', e.message);
      }
    }

    console.log(
      `[actividad] entrego "${lectura.titulo}" archivo="${lectura.nombreArchivo || '-'}" ` +
      `parrafos=${lectura.parrafos?.length || 0} preguntas=${lectura.preguntasOpcionMultiple?.length || 0} ` +
      `abiertas=${[lectura.preguntaLiteral?.enunciado, lectura.preguntaInferencial?.enunciado, lectura.preguntaCritico?.enunciado].filter(Boolean).length}/3`
    );

    res.json({
      readingId: lectura._id,
      _id: lectura._id,
      titulo: lectura.titulo,
      autor: lectura.autor,
      tipo: lectura.tipo,
      tiempoEstimado: lectura.tiempoEstimado,
      tiempoEstimadoMin: lectura.tiempoEstimadoMin,
      pdfUrl: lectura.pdfUrl,
      parrafos: lectura.parrafos || [],
      preguntas: (lectura.preguntasOpcionMultiple || []).map((q) => ({
        id: q.id,
        nivel: q.nivel || 'literal',
        enunciado: q.enunciado,
        opciones: (q.opciones || []).map((o) => ({ id: o.id, texto: o.texto })),
      })),
      preguntaLiteral: { enunciado: lectura.preguntaLiteral?.enunciado || '' },
      preguntaInferencial: { enunciado: lectura.preguntaInferencial?.enunciado || '' },
      preguntaCritico: { enunciado: lectura.preguntaCritico?.enunciado || '' },
    });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al cargar la actividad', error: error.message });
  }
};
