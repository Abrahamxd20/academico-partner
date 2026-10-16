const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { protect, soloAdmin } = require('../middleware/authMiddleware');

// Todas las rutas del dashboard requieren estar autenticado
router.use(protect);

// Los reportes pedagógicos son para docentes y admin; el dashboard global y auditoría son solo del propietario.
router.use((req, res, next) => {
  const rolesPermitidos = ['docente', 'profesor', 'admin'];
  if (!rolesPermitidos.includes((req.user?.rol || '').toLowerCase())) {
    return res.status(403).json({ mensaje: 'No tienes permiso para ver esta sección' });
  }
  next();
});

// Docentes ven únicamente progreso asociado a sus cursos; si un admin usa
// estas rutas globales también debe pasar la validación de ADMIN_EMAIL.
const adminPropietarioSiAdmin = (req, res, next) => {
  if ((req.user?.rol || '').toLowerCase() === 'admin') return soloAdmin(req, res, next);
  next();
};
router.get('/resumen', adminPropietarioSiAdmin, dashboardController.resumenGlobal);
router.get('/por-lectura', adminPropietarioSiAdmin, dashboardController.resumenPorLectura);
router.get('/por-alumno/:alumnoId', adminPropietarioSiAdmin, dashboardController.resumenPorAlumno);
router.get('/todos', adminPropietarioSiAdmin, dashboardController.listarTodos);
router.get('/admin', soloAdmin, dashboardController.resumenAdmin);
router.get('/admin/acciones', soloAdmin, dashboardController.listarAccionesAdmin);

module.exports = router;
