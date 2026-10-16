// Crea (o promueve) el primer administrador. Nadie puede auto-registrarse como admin desde la web.
//   uso:  ADMIN_EMAIL=admin@colegio.pe ADMIN_PASSWORD=ClaveSegura1 node scripts/crearAdmin.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

(async () => {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || password.length < 8) {
    console.error('🔴 Define ADMIN_EMAIL y ADMIN_PASSWORD (mínimo 8 caracteres).');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/asistente_lectura');
  const hash = await bcrypt.hash(password, 10);
  const existente = await User.findOne({ email });
  if (existente) {
    existente.rol = 'admin'; existente.password = hash; existente.activo = true;
    await existente.save();
    console.log(`✅ ${email} ahora es administrador.`);
  } else {
    await User.create({ nombre: 'Administrador', apellido: 'Sistema', username: 'admin.sistema',
      email, password: hash, rol: 'admin' });
    console.log(`✅ Administrador creado: ${email}`);
  }
  await mongoose.disconnect();
})().catch((e) => { console.error('🔴', e.message); process.exit(1); });
