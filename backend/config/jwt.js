// Secreto del JWT. Si falta, el servidor NO arranca.
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 16) {
  console.error(
    '🔴 Falta JWT_SECRET en backend/.env (mínimo 16 caracteres).\n' +
    '   Genera uno con:  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
  );
  process.exit(1);
}

module.exports = { JWT_SECRET };