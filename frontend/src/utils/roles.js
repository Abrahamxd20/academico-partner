export function normalizarRol(rol) {
  if (!rol) return '';
  const r = rol.toLowerCase();
  if (r === 'profesor') return 'docente';
  if (r === 'estudiante') return 'alumno';
  return r;
}

export function rutaInicial(rol) {
  const r = normalizarRol(rol);
  if (r === 'admin') return '/admin/dashboard';
  if (r === 'docente') return '/teacher/dashboard';
  return '/cursos';
}
