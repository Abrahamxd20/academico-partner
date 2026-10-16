const atenderConsultaIA = async (req, res) => {
  try {
    res.json({ respuesta: "Hola, el controlador de IA está funcionando correctamente." });
  } catch (error) {
    res.status(500).json({ mensaje: "Error en el servidor", error: error.message });
  }
};

module.exports = {
  atenderConsultaIA,
};