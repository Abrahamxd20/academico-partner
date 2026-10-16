require('dotenv').config();

const mongoose = require('mongoose');
const readline = require('readline');
const { stdin, stdout } = require('process');

const DB_NAME = 'asistente_lectura';
const LOCAL_URI = `mongodb://127.0.0.1:27017/${DB_NAME}`;

function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY || !stdout.isTTY) {
      reject(new Error('Ejecuta este comando en una terminal interactiva de PowerShell.'));
      return;
    }

    stdout.write(prompt);
    let value = '';
    const onData = (chunk) => {
      const text = chunk.toString('utf8');
      for (const char of text) {
        if (char === '\r' || char === '\n') {
          stdin.off('data', onData);
          stdin.setRawMode(false);
          stdin.pause();
          stdout.write('\n');
          resolve(value.trim());
          return;
        }
        if (char === '\u0003') {
          stdin.off('data', onData);
          stdin.setRawMode(false);
          stdin.pause();
          reject(new Error('Operación cancelada.'));
          return;
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };

    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function ensureCollection(db, name) {
  try {
    await db.createCollection(name);
  } catch (error) {
    if (error.code !== 48) throw error; // NamespaceExists
  }
}

async function copyCollection(sourceDb, targetDb, name) {
  const source = sourceDb.collection(name);
  const target = targetDb.collection(name);
  const cursor = source.find({}).batchSize(500);
  let operations = [];
  let readCount = 0;
  let insertedCount = 0;

  for await (const document of cursor) {
    readCount += 1;
    operations.push({
      updateOne: {
        filter: { _id: document._id },
        update: { $setOnInsert: document },
        upsert: true,
      },
    });

    if (operations.length === 500) {
      const result = await target.bulkWrite(operations, { ordered: false });
      insertedCount += result.upsertedCount;
      operations = [];
    }
  }

  if (operations.length) {
    const result = await target.bulkWrite(operations, { ordered: false });
    insertedCount += result.upsertedCount;
  }

  return { readCount, insertedCount };
}

async function main() {
  console.log(`Origen: MongoDB local (${DB_NAME}).`);
  console.log(`Destino: Atlas, base ${DB_NAME}.`);
  console.log('La base local se conservará. Los documentos existentes en Atlas no se reemplazarán.');

  const atlasUri = await readHidden('Pega la cadena de conexión de Atlas (la entrada no se mostrará): ');
  if (!atlasUri.startsWith('mongodb+srv://') && !atlasUri.startsWith('mongodb://')) {
    throw new Error('La cadena debe comenzar con mongodb+srv:// o mongodb://.');
  }

  let atlasHost;
  try {
    atlasHost = new URL(atlasUri).hostname;
  } catch {
    throw new Error('La cadena de conexión no tiene un formato válido.');
  }
  if (!atlasHost.endsWith('.mongodb.net')) {
    throw new Error('El destino no parece ser Atlas: el host debe terminar en .mongodb.net.');
  }

  const local = await mongoose.createConnection(LOCAL_URI, {
    serverSelectionTimeoutMS: 10000,
  }).asPromise();
  const atlas = await mongoose.createConnection(atlasUri, {
    dbName: DB_NAME,
    serverSelectionTimeoutMS: 20000,
  }).asPromise();

  try {
    const sourceDb = local.db;
    const targetDb = atlas.db;
    const collections = await sourceDb.listCollections({ type: 'collection' }).toArray();

    if (!collections.length) {
      throw new Error(`No se encontraron colecciones en ${DB_NAME} local.`);
    }

    console.log(`\nSe copiarán ${collections.length} colecciones:`);
    for (const { name } of collections) {
      await ensureCollection(targetDb, name);
      const { readCount, insertedCount } = await copyCollection(sourceDb, targetDb, name);
      console.log(`- ${name}: ${insertedCount} nuevos de ${readCount} documentos locales.`);
    }

    console.log('\nCopia terminada. Actualiza Data Explorer en Atlas y abre la base asistente_lectura.');
  } finally {
    await Promise.allSettled([local.close(), atlas.close()]);
    atlasUri.replace(/./g, '\0');
  }
}

main().catch((error) => {
  console.error(`\nNo se completó la migración: ${error.message}`);
  process.exitCode = 1;
});
