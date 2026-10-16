const nodemailer = require('nodemailer');

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

const enviarCredenciales = async (email, username, password) => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return { enviado: false, mensaje: 'El correo no está configurado en el servidor (EMAIL_USER y EMAIL_PASS).' };
    }
    const transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: 'Tus credenciales de acceso',
      html: `
        <h3>Bienvenido a la plataforma!</h3>
        <p>Se creó una cuenta para ti. Usa estas credenciales para iniciar sesión:</p>
        <p><b>Correo:</b> ${escapeHtml(email)}</p>
        <p><b>Usuario:</b> ${escapeHtml(username)}</p>
        <p><b>Contraseña temporal:</b> ${escapeHtml(password)}</p>
        <br/>
        <p>Esta contraseña es temporal. Cámbiala después de iniciar sesión.</p>
      `
    };
    await transporter.sendMail(mailOptions);
    return { enviado: true };
  } catch (error) {
    console.error('Error al enviar correo:', error);
    return { enviado: false, mensaje: 'No se pudo enviar el correo. Revisa la configuración del servidor.' };
  }
};

module.exports = { enviarCredenciales };
