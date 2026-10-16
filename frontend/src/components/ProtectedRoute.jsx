import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

const GRUPOS_ROL = {
  alumno: ['alumno', 'estudiante'],
  docente: ['docente', 'profesor', 'admin'],
  admin: ['admin'],
};

export default function ProtectedRoute({ children, rolesPermitidos }) {
  const { user } = useContext(AuthContext);

  // 1. Si no hay usuario, mandarlo al login.
  if (!user) return <Navigate to="/" replace />;

  // 2. Si se definieron roles permitidos, validar el acceso.
  if (rolesPermitidos) {
    const rolActual = (user.rol || '').toLowerCase();
    const permitido = rolesPermitidos.some((grupo) => GRUPOS_ROL[grupo]?.includes(rolActual));

    if (!permitido) {
      // SOLO redirigir si el usuario realmente no pertenece a ningún grupo permitido.
      // Si es docente/admin, mandarlo a su dashboard. Si es alumno, a su lectura.
      const esDocenteOAdmin = GRUPOS_ROL.docente.includes(rolActual);
      return <Navigate to={rolActual === 'admin' ? '/admin/dashboard' : esDocenteOAdmin ? '/teacher/dashboard' : '/student/reading'} replace />;
    }
  }

  // 3. IMPORTANTE: Si llegó aquí, tiene permiso. NO hacer ningún Navigate.
  // Esto evita que cualquier cambio de estado durante una petición API dispare redirecciones.
  return children;
}
