const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { JWT_SECRET } = require('../config/jwt');
const { matricularAlumnoEnSuSeccion } = require('./cursoController');
const { enviarCredenciales } = require('../utils/emailService');
const { registrarAccion } = require('../utils/auditoria');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DNI_RE = /^\d{8}$/;
const MSG_DNI = 'El DNI debe tener 8 dígitos';

const generarToken = (user) =>
  jwt.sign({ id: user._id, rol: user.rol }, JWT_SECRET, { expiresIn: '1d' });

const datosUsuario = (u) => ({
  id: u._id,
  nombre: u.nombre,
  apellido: u.apellido,
  username: u.username,
  email: u.email,
  dni: u.dni,
  rol: u.rol,
  grado: u.grado,
  seccion: u.seccion,
});

const generarUsername = async (nombre, apellido) => {
  const base = `${nombre}.${apellido}`
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.]/g, '');

  let username = base;
  let sufijo = 1;
  while (await User.findOne({ username })) {
    username = `${base}${sufijo}`;
    sufijo++;
  }
  return username;
};

// HU1 / HU2 — Registro por rol
exports.register = async (req, res) => {
  try {
    const nombre = (req.body.nombre || '').trim();
    const apellido = (req.body.apellido || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const { password, rol, claveDocente } = req.body;
    const grado = (req.body.grado || '').trim();
    const seccion = (req.body.seccion || '').trim();
    const dni = (req.body.dni || '').trim();

    if (!nombre || !apellido || !email || !password) {
      return res.status(400).json({ message: 'Por favor completa todos los campos requeridos' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ message: 'El correo no tiene un formato válido' });
    }
    if (!DNI_RE.test(dni)) {
      return res.status(400).json({ message: MSG_DNI });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
    }
    // Solo se puede auto-registrar alumno o docente. 'admin' jamás se crea desde aquí.
    if (rol !== undefined && !['alumno', 'docente'].includes(rol)) {
      return res.status(400).json({ message: 'Rol no válido' });
    }

    if (await User.findOne({ $or: [{ email }, { dni }] })) {
      return res.status(400).json({ message: 'El usuario ya existe' });
    }

    // HU2: un docente necesita la clave; un alumno no puede registrarse como docente sin ella.
    let rolAsignado = 'alumno';
    if (rol === 'docente') {
      const claveValida = process.env.TEACHER_SIGNUP_CODE;
      if (!claveValida || claveDocente !== claveValida) {
        return res.status(403).json({ message: 'Clave de docente incorrecta' });
      }
      rolAsignado = 'docente';
    } else if (!grado || !seccion) {
      // Los reportes filtran por grado/sección: sin ellos el alumno no aparecería en el dashboard.
      return res.status(400).json({ message: 'El alumno debe indicar su grado y sección' });
    }

    const username = await generarUsername(nombre, apellido);
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      nombre, apellido, username, email, dni,
      password: hashedPassword,
      rol: rolAsignado,
      grado: rolAsignado === 'alumno' ? grado : undefined,
      seccion: rolAsignado === 'alumno' ? seccion : undefined,
    });

    await matricularAlumnoEnSuSeccion(newUser);

    try {
      req.user = { id: newUser._id, rol: newUser.rol };
      await registrarAccion(req, { action: 'auth.registro', entity: 'User', entityId: newUser._id,
        affectedUserId: newUser._id, details: { rol: newUser.rol } });
    } catch (errorAuditoria) { console.error('[auditoría] No se registró el alta de usuario:', errorAuditoria.message); }

    res.status(201).json({
      message: 'Usuario registrado con éxito',
      token: generarToken(newUser),
      user: datosUsuario(newUser),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'El usuario ya existe' });
    }
    console.error('Error en register:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// HU1 — Ingreso. Mismo mensaje si falla usuario o contraseña (no revela qué cuentas existen).
exports.login = async (req, res) => {
  try {
    const identifier = (req.body.identifier || '').trim().toLowerCase();
    const { password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ message: 'Por favor ingresa usuario/correo y contraseña' });
    }

    const user = await User.findOne({ $or: [{ email: identifier }, { username: identifier }, { dni: identifier }] });
    const ok = user && (await bcrypt.compare(password, user.password));
    if (!ok) {
      return res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
    }
    if (user.activo === false) {
      return res.status(403).json({ message: 'Tu cuenta está desactivada. Contacta al administrador' });
    }

    req.user = { id: user._id, rol: user.rol };
    try {
      await registrarAccion(req, { action: 'auth.login', entity: 'User', entityId: user._id,
        affectedUserId: user._id, details: { metodo: 'password' } });
    } catch (errorAuditoria) { console.error('[auditoría] No se registró el inicio de sesión:', errorAuditoria.message); }
    res.json({ token: generarToken(user), user: datosUsuario(user) });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// Login con Google. Antes se decodificaba el token SIN verificar la firma (cualquiera podía
// fabricar uno con el correo de un docente). Ahora lo valida Google y se comprueba el client id.
exports.googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ message: 'Credencial de Google requerida' });
    }
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(503).json({ message: 'El acceso con Google no está configurado' });
    }

    const r = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
    );
    if (!r.ok) return res.status(401).json({ message: 'Credencial de Google inválida' });

    const info = await r.json();
    if (info.aud !== process.env.GOOGLE_CLIENT_ID || String(info.email_verified) !== 'true') {
      return res.status(401).json({ message: 'Credencial de Google inválida' });
    }

    const user = await User.findOne({ email: String(info.email).toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: 'Usuario no registrado' });
    }
    if (user.activo === false) {
      return res.status(403).json({ message: 'Tu cuenta está desactivada. Contacta al administrador' });
    }

    req.user = { id: user._id, rol: user.rol };
    try {
      await registrarAccion(req, { action: 'auth.login', entity: 'User', entityId: user._id,
        affectedUserId: user._id, details: { metodo: 'google' } });
    } catch (errorAuditoria) { console.error('[auditoría] No se registró el inicio de sesión:', errorAuditoria.message); }
    res.json({ token: generarToken(user), user: datosUsuario(user) });
  } catch (error) {
    console.error('Error en googleLogin:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ───────────────────────── RF-03 / matrícula de usuarios ─────────────────────────
// El administrador gestiona todos los roles. El docente solo matricula y gestiona ALUMNOS.

const escapeRegex = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ROLES = ['alumno', 'docente', 'admin'];
const esAdmin = (req) => (req.user?.rol || '').toLowerCase() === 'admin';
const puedeGestionar = (req, rolObjetivo) => esAdmin(req) || rolObjetivo === 'alumno';

// Contraseña temporal legible (sin 0/O/1/l/I, que se confunden al dictarla)
const generarPasswordTemporal = () => {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from({ length: 8 }, () => abc[crypto.randomInt(abc.length)]).join('');
};

// GET /api/auth/users?q=texto&rol=alumno  → solo usuarios activos (eliminación lógica)
exports.listarUsuarios = async (req, res) => {
  try {
    const filtro = { activo: { $ne: false } };
    if (!esAdmin(req)) filtro.rol = 'alumno';
    else if (ROLES.includes(req.query.rol)) filtro.rol = req.query.rol;

    const q = (req.query.q || '').trim();
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filtro.$or = [{ nombre: rx }, { apellido: rx }, { email: rx }, { username: rx }, { dni: rx }];
    }
    const usuarios = await User.find(filtro).select('-password').sort({ createdAt: -1 });
    res.json(usuarios);
  } catch (error) {
    console.error('Error en listarUsuarios:', error);
    res.status(500).json({ message: 'Error al listar los usuarios' });
  }
};

// Valida y normaliza alta/edición. Devuelve { error } o { datos }. La contraseña es opcional.
function validarUsuarioAdmin(body) {
  const datos = {
    dni: (body.dni || '').trim(),
    nombre: (body.nombre || '').trim(),
    apellido: (body.apellido || '').trim(),
    email: (body.email || '').trim().toLowerCase(),
    rol: body.rol,
    grado: (body.grado || '').trim(),
    seccion: (body.seccion || '').trim(),
  };
  if (!DNI_RE.test(datos.dni)) return { error: MSG_DNI };
  if (!datos.nombre || !datos.apellido || !datos.email) return { error: 'Completa los campos obligatorios' };
  if (!EMAIL_RE.test(datos.email)) return { error: 'El correo no tiene un formato válido' };
  if (!ROLES.includes(datos.rol)) return { error: 'Selecciona un rol válido' };
  if (datos.rol === 'alumno' && (!datos.grado || !datos.seccion)) return { error: 'El alumno debe indicar su grado y sección' };

  const password = body.password;
  if (password !== undefined && password !== '') {
    if (String(password).length < 6) return { error: 'La contraseña debe tener al menos 6 caracteres' };
    datos.password = String(password);
  }
  return { datos };
}

// POST /api/auth/users  → "Matricular usuarios"
// Sin contraseña en el formulario, se genera una temporal y se devuelve UNA sola vez.
exports.crearUsuario = async (req, res) => {
  try {
    const { error, datos } = validarUsuarioAdmin(req.body);
    if (error) return res.status(400).json({ message: error });
    if (!puedeGestionar(req, datos.rol)) {
      return res.status(403).json({ message: 'Un docente solo puede matricular alumnos' });
    }
    if (await User.findOne({ $or: [{ email: datos.email }, { dni: datos.dni }] })) {
      return res.status(400).json({ message: 'El usuario ya existe' });
    }

    // La cuenta nueva siempre usa una clave temporal para poder entregar credenciales seguras.
    const passwordTemporal = generarPasswordTemporal();
    const nuevo = await User.create({
      dni: datos.dni, nombre: datos.nombre, apellido: datos.apellido, email: datos.email,
      username: await generarUsername(datos.nombre, datos.apellido),
      password: await bcrypt.hash(passwordTemporal, 10),
      rol: datos.rol,
      grado: datos.rol === 'alumno' ? datos.grado : undefined,
      seccion: datos.rol === 'alumno' ? datos.seccion : undefined,
    });
    await matricularAlumnoEnSuSeccion(nuevo);
    await registrarAccion(req, { action: 'usuario.creado', entity: 'User', entityId: nuevo._id, affectedUserId: nuevo._id, details: { rol: nuevo.rol } });
    const resultadoCorreo = await enviarCredenciales(nuevo.email, nuevo.username, passwordTemporal);
    res.status(201).json({
      message: 'Usuario registrado con éxito', user: datosUsuario(nuevo), passwordTemporal,
      emailEnviado: resultadoCorreo.enviado,
      avisoCorreo: resultadoCorreo.enviado ? '' : resultadoCorreo.mensaje,
    });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'El usuario ya existe' });
    console.error('Error en crearUsuario:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// Reintento de envío: se acepta la clave temporal solo si coincide con el hash vigente.
exports.reenviarCredenciales = async (req, res) => {
  try {
    const usuario = await User.findById(req.params.id);
    if (!usuario || usuario.activo === false) return res.status(404).json({ message: 'Usuario no encontrado' });
    if (!puedeGestionar(req, usuario.rol)) return res.status(403).json({ message: 'No tienes permiso para gestionar este usuario' });
    const password = String(req.body.password || '');
    if (password.length < 6 || !(await bcrypt.compare(password, usuario.password))) {
      return res.status(400).json({ message: 'La contraseña temporal ya no coincide. Asígnale una nueva para enviar sus credenciales.' });
    }
    const resultado = await enviarCredenciales(usuario.email, usuario.username, password);
    if (!resultado.enviado) return res.status(503).json({ message: resultado.mensaje });
    await registrarAccion(req, { action: 'usuario.credenciales.reenviadas', entity: 'User', entityId: usuario._id, affectedUserId: usuario._id });
    res.json({ message: `Credenciales enviadas a ${usuario.email}` });
  } catch (error) {
    console.error('Error en reenviarCredenciales:', error);
    res.status(500).json({ message: 'No se pudieron enviar las credenciales' });
  }
};

// PUT /api/auth/users/:id
exports.actualizarUsuario = async (req, res) => {
  try {
    const { error, datos } = validarUsuarioAdmin(req.body);
    if (error) return res.status(400).json({ message: error });

    const usuario = await User.findById(req.params.id);
    if (!usuario || usuario.activo === false) return res.status(404).json({ message: 'Usuario no encontrado' });
    if (!puedeGestionar(req, usuario.rol) || !puedeGestionar(req, datos.rol)) {
      return res.status(403).json({ message: 'Un docente solo puede gestionar alumnos' });
    }
    // Evita que el admin se quite a sí mismo el acceso y deje el sistema sin administrador.
    if (String(usuario._id) === String(req.user.id) && datos.rol !== usuario.rol) {
      return res.status(400).json({ message: 'No puedes cambiar tu propio rol' });
    }
    const repetido = await User.findOne({ $or: [{ email: datos.email }, { dni: datos.dni }], _id: { $ne: usuario._id } });
    if (repetido) return res.status(400).json({ message: 'El usuario ya existe' });

    const rolAnterior = usuario.rol;
    usuario.dni = datos.dni;
    usuario.nombre = datos.nombre;
    usuario.apellido = datos.apellido;
    usuario.email = datos.email;
    usuario.rol = datos.rol;
    usuario.grado = datos.rol === 'alumno' ? datos.grado : undefined;
    usuario.seccion = datos.rol === 'alumno' ? datos.seccion : undefined;
    if (datos.password) usuario.password = await bcrypt.hash(datos.password, 10);
    await usuario.save();

    await registrarAccion(req, { action: 'usuario.actualizado', entity: 'User', entityId: usuario._id, affectedUserId: usuario._id, details: { rolAnterior, rolNuevo: datos.rol, cambioContrasena: !!datos.password } });

    res.json({ message: 'Usuario actualizado', user: datosUsuario(usuario) });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'El usuario ya existe' });
    console.error('Error en actualizarUsuario:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// DELETE /api/auth/users/:id → eliminación LÓGICA (activo=false), como pide el documento (estado 0)
exports.eliminarUsuario = async (req, res) => {
  try {
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ message: 'No puedes eliminar tu propia cuenta' });
    }
    const usuario = await User.findById(req.params.id);
    if (!usuario || usuario.activo === false) return res.status(404).json({ message: 'Usuario no encontrado' });
    if (!puedeGestionar(req, usuario.rol)) {
      return res.status(403).json({ message: 'Un docente solo puede gestionar alumnos' });
    }

    usuario.activo = false;
    await usuario.save();
    await registrarAccion(req, { action: 'usuario.eliminado', entity: 'User', entityId: usuario._id, affectedUserId: usuario._id, details: { rol: usuario.rol } });
    res.json({ message: 'Usuario eliminado' });
  } catch (error) {
    console.error('Error en eliminarUsuario:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ───────────────────────── Perfil del propio usuario (pantalla Configuración) ─────────────────────────

const NIVELES = ['Primaria', 'Secundaria', 'Bachillerato', 'Universitario'];
const ESTRATEGIAS = ['Lectura guiada', 'Lectura en voz alta', 'Lectura silenciosa', 'Lectura compartida', 'Lectura independiente'];

// GET /api/auth/me → datos del usuario en sesión (nunca la contraseña: está cifrada con bcrypt y no se puede mostrar)
exports.obtenerPerfil = async (req, res) => {
  try {
    const u = await User.findById(req.user.id).select('-password');
    if (!u || u.activo === false) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json({ ...datosUsuario(u), configDocente: u.configDocente || {} });
  } catch (error) {
    console.error('Error en obtenerPerfil:', error);
    res.status(500).json({ message: 'Error al obtener el perfil' });
  }
};

// PUT /api/auth/me  body: { nombre, apellido, email, passwordActual?, passwordNueva? }
exports.actualizarPerfil = async (req, res) => {
  try {
    const nombre = (req.body.nombre || '').trim();
    const apellido = (req.body.apellido || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const { passwordActual, passwordNueva } = req.body;

    if (!nombre || !apellido || !email) return res.status(400).json({ message: 'Completa nombre, apellido y correo' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'El correo no tiene un formato válido' });

    const u = await User.findById(req.user.id);
    if (!u || u.activo === false) return res.status(404).json({ message: 'Usuario no encontrado' });

    if (await User.findOne({ email, _id: { $ne: u._id } })) {
      return res.status(400).json({ message: 'Ese correo ya está en uso' });
    }

    if (passwordNueva) {
      if (String(passwordNueva).length < 6) return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres' });
      if (!passwordActual || !(await bcrypt.compare(String(passwordActual), u.password))) {
        return res.status(400).json({ message: 'La contraseña actual es incorrecta' });
      }
      u.password = await bcrypt.hash(String(passwordNueva), 10);
    }

    u.nombre = nombre;
    u.apellido = apellido;
    u.email = email;
    await u.save();
    await registrarAccion(req, {
      action: 'perfil.actualizado', entity: 'User', entityId: u._id, affectedUserId: u._id,
      details: { campos: ['nombre', 'apellido', 'email'], cambioContrasena: !!passwordNueva },
    });

    res.json({ message: 'Perfil actualizado', user: datosUsuario(u) });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'Ese correo ya está en uso' });
    console.error('Error en actualizarPerfil:', error);
    res.status(500).json({ message: 'Error al actualizar el perfil' });
  }
};

// PUT /api/auth/me/config → configuración pedagógica del docente
exports.actualizarConfigDocente = async (req, res) => {
  try {
    const b = req.body || {};
    const entre = (v, min, max) => Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max;

    if (!entre(b.tiempoMaxEval, 1, 180)) return res.status(400).json({ message: 'El tiempo máximo debe estar entre 1 y 180 minutos' });
    if (!entre(b.umbralAprobacion, 0, 100)) return res.status(400).json({ message: 'El umbral de aprobación debe estar entre 0 y 100' });
    if (!entre(b.cantPreguntasIA, 1, 10)) return res.status(400).json({ message: 'El número de preguntas debe estar entre 1 y 10' });
    if (!NIVELES.includes(b.nivelEducativo)) return res.status(400).json({ message: 'Nivel educativo no válido' });

    const configDocente = {
      institucion: String(b.institucion || '').trim().slice(0, 200),
      tiempoMaxEval: Number(b.tiempoMaxEval),
      umbralAprobacion: Number(b.umbralAprobacion),
      nivelEducativo: b.nivelEducativo,
      cantPreguntasIA: Math.round(Number(b.cantPreguntasIA)),
      estrategiaDefault: (Array.isArray(b.estrategiaDefault) ? b.estrategiaDefault : []).filter((e) => ESTRATEGIAS.includes(e)),
    };

    const u = await User.findByIdAndUpdate(req.user.id, { $set: { configDocente } }, { new: true });
    if (!u) return res.status(404).json({ message: 'Usuario no encontrado' });
    await registrarAccion(req, {
      action: 'docente.configuracion.actualizada', entity: 'User', entityId: u._id, affectedUserId: u._id,
      details: { campos: Object.keys(configDocente), umbralAprobacion: configDocente.umbralAprobacion, cantPreguntasIA: configDocente.cantPreguntasIA },
    });
    res.json({ message: 'Configuración guardada', configDocente: u.configDocente });
  } catch (error) {
    console.error('Error en actualizarConfigDocente:', error);
    res.status(500).json({ message: 'Error al guardar la configuración' });
  }
};
