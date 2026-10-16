// Mantenimiento de la base de datos. Por defecto SOLO INFORMA: no cambia nada.
//
//   node scripts/mantenimientoBD.js                        → informe (seguro)
//   node scripts/mantenimientoBD.js --migrar-libros        → copia "libros" → "lecturas" (idempotente)
//   node scripts/mantenimientoBD.js --quitar-duplicadas    → borra lecturas repetidas (deja la más reciente)
//   node scripts/mantenimientoBD.js --eliminar=Alumno,estudiantes,questions,readings
//                                                          → borra ESAS colecciones, solo si ningún modelo las usa
//
// Antes de aplicar cambios haz un respaldo (Compass: colección → Export Data) o:  mongodump --db asistente_lectura
const LEGACY = 'libros'; // colección del modelo antiguo "Libro"; su contenido vive ahora en "lecturas"

// ───────────────────────── lógica (recibe la conexión: así se puede probar sin Mongo) ─────────────────────────
async function ejecutar(db, { usadas, migrarLibros = false, quitarDuplicadas = false, eliminar = [] }, log = console.log) {
  const existentes = (await db.listCollections().toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.'));
  const docs = async (nombre) => (existentes.includes(nombre) ? db.collection(nombre).find({}).toArray() : []);

  // ── Informe: qué colecciones hay y quién las usa
  log('\n=== COLECCIONES ===');
  for (const nombre of existentes.sort()) {
    const n = await db.collection(nombre).countDocuments();
    const estado = usadas.includes(nombre) ? 'EN USO (la usa un modelo)'
      : nombre === LEGACY ? 'HEREDADA (modelo antiguo Libro → migrar a "lecturas")'
      : 'HUÉRFANA (ningún modelo la usa)';
    log(`  ${nombre.padEnd(20)} ${String(n).padStart(4)} doc(s)   ${estado}`);
  }
  for (const u of usadas.filter((x) => !existentes.includes(x))) log(`  ${u.padEnd(20)}    - (aún no existe; se crea sola al guardar el primer dato)`);

  // ── Libros sin migrar
  const libros = await docs(LEGACY);
  const lecturas = await docs('lecturas');
  const urls = new Set(lecturas.map((l) => l.pdfUrl).filter(Boolean));
  const pendientes = libros.filter((l) => l.pdfUrl && !urls.has(l.pdfUrl));
  log('\n=== LIBROS SIN MIGRAR ===');
  if (pendientes.length === 0) log('  Ninguno.');
  pendientes.forEach((l) => log(`  - "${l.titulo}" (${l.pdfUrl}) no aparece en "lecturas": la biblioteca NO lo muestra.`));

  // ── Lecturas duplicadas (mismo título y ninguna con PDF: típico de la lectura semilla creada dos veces)
  const grupos = {};
  for (const l of lecturas.filter((x) => !x.pdfUrl)) (grupos[l.titulo] = grupos[l.titulo] || []).push(l);
  const duplicadas = Object.entries(grupos).filter(([, v]) => v.length > 1);
  log('\n=== LECTURAS DUPLICADAS ===');
  if (duplicadas.length === 0) log('  Ninguna.');
  duplicadas.forEach(([t, v]) => log(`  - "${t}" aparece ${v.length} veces`));

  // ── Usuarios
  const users = await docs('users');
  const roles = users.reduce((a, u) => ({ ...a, [u.rol]: (a[u.rol] || 0) + 1 }), {});
  log('\n=== USUARIOS ===');
  log(`  Total: ${users.length}  ${JSON.stringify(roles)}`);
  log(`  Sin DNI: ${users.filter((u) => !u.dni).length}  (no pueden entrar con DNI hasta que se les asigne uno)`);
  if (!roles.admin) log('  Aviso: no hay ningún usuario "admin" (se crea con: node scripts/crearAdmin.js)');

  // ── Seguimiento
  log('\n=== SEGUIMIENTO ===');
  const nProg = existentes.includes('studentprogresses') ? await db.collection('studentprogresses').countDocuments() : 0;
  const nCur = existentes.includes('cursos') ? await db.collection('cursos').countDocuments() : 0;
  log(`  Progresos guardados (studentprogresses): ${nProg}`);
  log(`  Cursos (cursos): ${nCur}`);

  // ── Acciones (solo si se pidieron)
  if (migrarLibros) {
    log('\n>>> MIGRANDO libros → lecturas');
    const ahora = new Date();
    for (const l of pendientes) {
      await db.collection('lecturas').insertOne({
        titulo: l.titulo, autor: l.autor || '', categoria: l.categoria || 'General',
        pdfUrl: l.pdfUrl, nombreArchivo: l.nombreArchivo, tamanioKB: l.tamanioKB,
        subidoPor: l.subidoPor, estado: l.estado || 'Publicado',
        // valores por defecto que el modelo Lectura aplica al crear con Mongoose
        tipo: 'Texto argumentativo', tiempoEstimado: '5 min', tiempoEstimadoMin: 5,
        parrafos: [], estrategias: [], preguntasOpcionMultiple: [],
        createdAt: l.createdAt || ahora, updatedAt: ahora, __v: 0,
      });
    }
    log(`    ${pendientes.length} lectura(s) migrada(s).`);
  }

  if (quitarDuplicadas) {
    log('\n>>> QUITANDO lecturas duplicadas');
    const referenciadas = new Set(
      existentes.includes('studentprogresses') ? (await db.collection('studentprogresses').distinct('readingId')).map(String) : []
    );
    let borradas = 0;
    for (const [titulo, v] of duplicadas) {
      v.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)); // la más reciente primero
      const sobrantes = v.slice(1).filter((l) => !referenciadas.has(String(l._id)));
      v.slice(1).filter((l) => referenciadas.has(String(l._id))).forEach(() => log(`    "${titulo}": una copia se conserva porque tiene progresos de alumnos asociados.`));
      if (sobrantes.length) await db.collection('lecturas').deleteMany({ _id: { $in: sobrantes.map((l) => l._id) } });
      borradas += sobrantes.length;
    }
    log(`    ${borradas} lectura(s) duplicada(s) eliminada(s).`);
  }

  if (eliminar.length) {
    log('\n>>> ELIMINANDO colecciones');
    for (const nombre of eliminar) {
      if (!existentes.includes(nombre)) { log(`    ${nombre}: no existe, se omite.`); continue; }
      if (usadas.includes(nombre)) { log(`    ${nombre}: REHUSADO, la usa un modelo del proyecto.`); continue; }
      if (nombre === LEGACY && pendientes.length > 0 && !migrarLibros) {
        log(`    ${nombre}: REHUSADO, aún tiene ${pendientes.length} libro(s) sin migrar (usa antes --migrar-libros).`);
        continue;
      }
      const n = await db.collection(nombre).countDocuments();
      await db.collection(nombre).drop();
      log(`    ${nombre}: eliminada (${n} documento(s)).`);
    }
  }

  if (!migrarLibros && !quitarDuplicadas && !eliminar.length) {
    log('\n(Solo informe: no se cambió nada. Añade --migrar-libros, --quitar-duplicadas o --eliminar=… para aplicar.)');
  }
}

module.exports = { ejecutar };

// ───────────────────────── ejecución real ─────────────────────────
if (require.main === module) {
  require('dotenv').config();
  (async () => {
    const mongoose = require('mongoose');
    const modelos = ['User', 'Lectura', 'StudentProgress', 'Curso'].map((m) => require(`../models/${m}`));
    const usadas = modelos.map((m) => m.collection.name);

    const arg = (p) => process.argv.find((a) => a.startsWith(p));
    const eliminar = (arg('--eliminar=') || '').replace('--eliminar=', '').split(',').map((s) => s.trim()).filter(Boolean);

    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/asistente_lectura');
    await ejecutar(mongoose.connection.db, {
      usadas,
      migrarLibros: process.argv.includes('--migrar-libros'),
      quitarDuplicadas: process.argv.includes('--quitar-duplicadas'),
      eliminar,
    });
    await mongoose.disconnect();
  })().catch((e) => { console.error('🔴', e.message); process.exit(1); });
}
