import React from 'react';
import CursoView from '../cursos/CursoView';

// "Carpetas de Aprendizaje" = el contenido real del curso (sesiones, materiales y rúbricas).
// Ya no hay sesiones inventadas: el docente crea las suyas con «Crear sesión».
export default function CarpetasAprendizaje({ cursos = [], cursoId, onCambiarCurso }) {
  const activo = cursos.some((c) => c._id === cursoId) ? cursoId : cursos[0]?._id;

  if (!activo) {
    return (
      <div className="dashboard-body" style={{ maxWidth: '900px', margin: '0 auto' }}>
        <p style={{ color: '#666' }}>
          Aún no tienes cursos. Ve a la pestaña «Cursos», crea el primero con «Crear Curso» y vuelve aquí para armar sus sesiones.
        </p>
      </div>
    );
  }

  return (
    <div className="dashboard-body" style={{ maxWidth: '900px', margin: '0 auto' }}>
      {cursos.length > 1 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', color: '#495057' }}>
          Curso:
          <select
            value={activo}
            onChange={(e) => onCambiarCurso?.(e.target.value)}
            style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
          >
            {cursos.map((c) => (
              <option key={c._id} value={c._id}>{c.nombre} {c.grado} «{c.seccion}»</option>
            ))}
          </select>
        </label>
      )}
      <CursoView key={activo} cursoId={activo} embebido />
    </div>
  );
}
