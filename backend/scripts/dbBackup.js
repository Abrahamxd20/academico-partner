const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config();

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/asistente_lectura';
const directorio = path.resolve(process.env.MONGO_BACKUP_DIR || path.join(__dirname, '..', 'backups'));
const prefijo = 'asistente-lectura-';

function obtenerBase(uri) {
  let nombre;
  try { nombre = decodeURIComponent(new URL(uri).pathname.replace(/^\/+/, '').split('/')[0] || ''); }
  catch { throw new Error('MONGO_URI no tiene un formato válido'); }
  if (!nombre || !/^[\w.-]+$/.test(nombre)) throw new Error('MONGO_URI debe indicar el nombre de la base de datos');
  return nombre;
}

function ejecutar(comando, argumentos) {
  return new Promise((resolve, reject) => {
    const proceso = spawn(comando, argumentos, { stdio: 'inherit', windowsHide: true });
    proceso.once('error', reject);
    proceso.once('close', (codigo) => codigo === 0 ? resolve() : reject(new Error(`${comando} terminó con código ${codigo}`)));
  });
}

async function listar() {
  if (!fs.existsSync(directorio)) return console.log('No hay copias de seguridad guardadas.');
  const archivos = fs.readdirSync(directorio)
    .filter((nombre) => nombre.startsWith(prefijo) && nombre.endsWith('.archive.gz'))
    .map((nombre) => ({ nombre, fecha: fs.statSync(path.join(directorio, nombre)).mtime }))
    .sort((a, b) => b.fecha - a.fecha);
  if (!archivos.length) return console.log('No hay copias de seguridad guardadas.');
  archivos.forEach(({ nombre, fecha }) => console.log(`${fecha.toLocaleString('es-PE')}  ${nombre}`));
}

async function limpiarAntiguas() {
  const dias = Math.max(1, Number.parseInt(process.env.MONGO_BACKUP_RETENTION_DAYS, 10) || 30);
  const limite = Date.now() - dias * 24 * 60 * 60 * 1000;
  for (const nombre of fs.readdirSync(directorio)) {
    if (!nombre.startsWith(prefijo) || !nombre.endsWith('.archive.gz')) continue;
    const destino = path.join(directorio, nombre);
    if (fs.statSync(destino).mtimeMs < limite) fs.unlinkSync(destino);
  }
}

async function crear() {
  const base = obtenerBase(mongoUri);
  fs.mkdirSync(directorio, { recursive: true });
  const marcaTiempo = new Date().toISOString().replace(/[:.]/g, '-');
  const archivo = path.join(directorio, `${prefijo}${marcaTiempo}.archive.gz`);
  let copiaCompleta = false;
  try {
    await ejecutar('mongodump', [`--uri=${mongoUri}`, `--db=${base}`, `--archive=${archivo}`, '--gzip']);
    if (!fs.existsSync(archivo) || fs.statSync(archivo).size === 0) throw new Error('mongodump no generó un archivo de respaldo válido');
    copiaCompleta = true;
    try { await limpiarAntiguas(); }
    catch (error) { console.error(`La copia quedó guardada, pero no se limpiaron respaldos antiguos: ${error.message}`); }
    console.log(`Copia creada: ${archivo}`);
  } catch (error) {
    if (!copiaCompleta && fs.existsSync(archivo)) fs.unlinkSync(archivo);
    throw error;
  }
}

async function restaurar(nombreArchivo) {
  const base = obtenerBase(mongoUri);
  if (!nombreArchivo) throw new Error('Indica el nombre del archivo de copia que deseas restaurar');
  const archivo = path.resolve(directorio, nombreArchivo);
  const relativo = path.relative(directorio, archivo);
  if (relativo.startsWith('..') || path.isAbsolute(relativo)) throw new Error('La copia debe estar dentro de la carpeta de respaldos configurada');
  if (!fs.existsSync(archivo) || !fs.statSync(archivo).isFile() || !archivo.endsWith('.archive.gz')) throw new Error('No se encontró un archivo .archive.gz válido');
  if (process.env.CONFIRMAR_RESTAURACION !== base) {
    throw new Error(`La restauración reemplaza los datos actuales. Para confirmar, establece CONFIRMAR_RESTAURACION=${base} y vuelve a ejecutar el comando.`);
  }
  await ejecutar('mongorestore', [
    `--uri=${mongoUri}`, `--archive=${archivo}`, '--gzip', '--drop', `--nsInclude=${base}.*`,
  ]);
  console.log(`Base ${base} restaurada desde ${path.basename(archivo)}`);
}

(async () => {
  try {
    const accion = process.argv[2];
    if (accion === 'backup') await crear();
    else if (accion === 'list') await listar();
    else if (accion === 'restore') await restaurar(process.argv[3]);
    else throw new Error('Uso: node scripts/dbBackup.js backup | list | restore <archivo.archive.gz>');
  } catch (error) {
    console.error(`Respaldo MongoDB: ${error.message}`);
    process.exitCode = 1;
  }
})();
