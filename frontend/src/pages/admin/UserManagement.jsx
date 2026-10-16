import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, GraduationCap, Mail, RefreshCw, Search, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import api from '../../services/api';
import AdminNavigation from '../../components/AdminNavigation';
import './UserManagement.css';

const FORMULARIO_VACIO = { nombre: '', apellido: '', dni: '', email: '', rol: 'alumno', grado: '', seccion: '' };
const etiquetaRol = (rol) => ({ alumno: 'Alumno', estudiante: 'Alumno', docente: 'Docente', profesor: 'Docente', admin: 'Administrador' }[rol] || rol);

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRol, setFilterRol] = useState('todos');
  const [formData, setFormData] = useState(FORMULARIO_VACIO);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/auth/users');
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.mensaje || 'No se pudo cargar la lista de usuarios.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const filteredUsers = useMemo(() => users.filter((user) => {
    const termino = searchTerm.trim().toLowerCase();
    const coincideTexto = !termino || [user.nombre, user.apellido, user.email, user.username]
      .some((dato) => String(dato || '').toLowerCase().includes(termino));
    const coincideRol = filterRol === 'todos'
      || (filterRol === 'docente' ? ['docente', 'profesor'].includes(user.rol) : ['alumno', 'estudiante'].includes(user.rol));
    return coincideTexto && coincideRol;
  }), [users, searchTerm, filterRol]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((actual) => ({ ...actual, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess(null);
    setSaving(true);
    try {
      const { data } = await api.post('/auth/users', formData);
      setSuccess({ message: data.message || 'Usuario creado correctamente.', password: data.passwordTemporal || '' });
      setFormData(FORMULARIO_VACIO);
      await fetchUsers();
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.mensaje || 'No se pudo crear el usuario.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user) => {
    if (!window.confirm(`¿Quieres desactivar la cuenta de ${user.nombre || user.email}?`)) return;
    setError('');
    setDeletingId(user._id);
    try {
      await api.delete(`/auth/users/${user._id}`);
      await fetchUsers();
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.mensaje || 'No se pudo desactivar al usuario.');
    } finally {
      setDeletingId('');
    }
  };

  const alumnos = users.filter((user) => ['alumno', 'estudiante'].includes(user.rol)).length;
  const docentes = users.filter((user) => ['docente', 'profesor'].includes(user.rol)).length;

  return (
    <main className="admin-users-page">
      <div className="admin-users-shell">
        <header className="admin-users-header">
          <div className="admin-users-heading">
            <span className="admin-users-heading-icon"><Users size={22} /></span>
            <div>
              <p className="admin-users-eyebrow">Administración</p>
              <h1>Gestión de usuarios</h1>
              <p>Administra las cuentas y los accesos de alumnos y docentes.</p>
            </div>
          </div>
          <div className="admin-users-header-actions">
            <button className="admin-users-button admin-users-button-light" onClick={fetchUsers} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'admin-users-spin' : ''} /> Actualizar
            </button>
          </div>
        </header>

        <AdminNavigation />

        <section className="admin-users-stats" aria-label="Resumen de usuarios">
          <article className="admin-users-stat-card"><span><Users size={18} /></span><div><small>Usuarios</small><strong>{users.length}</strong></div></article>
          <article className="admin-users-stat-card"><span><GraduationCap size={18} /></span><div><small>Alumnos</small><strong>{alumnos}</strong></div></article>
          <article className="admin-users-stat-card"><span><ShieldCheck size={18} /></span><div><small>Docentes</small><strong>{docentes}</strong></div></article>
        </section>

        {error && <div className="admin-users-alert admin-users-alert-error" role="alert">{error}</div>}

        <div className="admin-users-content">
          <section className="admin-users-card admin-users-form-card">
            <div className="admin-users-card-title">
              <span className="admin-users-title-icon"><UserPlus size={19} /></span>
              <div><h2>Crear usuario</h2><p>Completa la información de la cuenta.</p></div>
            </div>

            {success && (
              <div className="admin-users-alert admin-users-alert-success" role="status">
                <CheckCircle2 size={18} />
                <div><strong>{success.message}</strong>
                  {success.password && <p>Contraseña temporal: <code>{success.password}</code>. Guárdala ahora; no volverá a mostrarse.</p>}
                  {!success.password && <p>{formData.email ? `Se enviaron las credenciales a ${formData.email}.` : 'El sistema intentó enviar las credenciales por correo.'}</p>}
                </div>
              </div>
            )}

            <form className="admin-users-form" onSubmit={handleSubmit}>
              <div className="admin-users-form-row">
                <label>Nombre<input name="nombre" value={formData.nombre} onChange={handleChange} required maxLength={100} placeholder="Nombre" /></label>
                <label>Apellido<input name="apellido" value={formData.apellido} onChange={handleChange} required maxLength={100} placeholder="Apellido" /></label>
              </div>
              <label>DNI<input name="dni" value={formData.dni} onChange={handleChange} required inputMode="numeric" pattern="[0-9]{8}" maxLength={8} placeholder="8 dígitos" /></label>
              <label>Correo electrónico<div className="admin-users-input-icon"><Mail size={16} /><input type="email" name="email" value={formData.email} onChange={handleChange} required maxLength={254} placeholder="usuario@colegio.edu.pe" /></div></label>
              <label>Rol<select name="rol" value={formData.rol} onChange={handleChange}><option value="alumno">Alumno</option><option value="docente">Docente</option></select></label>
              {formData.rol === 'alumno' && (
                <div className="admin-users-form-row">
                  <label>Grado<input name="grado" value={formData.grado} onChange={handleChange} required placeholder="Ej. 2.º de secundaria" /></label>
                  <label>Sección<input name="seccion" value={formData.seccion} onChange={handleChange} required placeholder="Ej. A" /></label>
                </div>
              )}
              <p className="admin-users-form-note">Se generará una contraseña temporal para la cuenta.</p>
              <button type="submit" className="admin-users-button admin-users-button-primary admin-users-submit" disabled={saving}>
                <UserPlus size={17} /> {saving ? 'Creando usuario…' : 'Crear cuenta'}
              </button>
            </form>
          </section>

          <section className="admin-users-card admin-users-list-card">
            <div className="admin-users-list-heading"><div><h2>Cuentas registradas</h2><p>{filteredUsers.length} resultado{filteredUsers.length === 1 ? '' : 's'}</p></div></div>
            <div className="admin-users-filters">
              <label className="admin-users-search"><Search size={18} /><input type="search" aria-label="Buscar usuarios" placeholder="Buscar por nombre, correo o usuario…" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} /></label>
              <select aria-label="Filtrar por rol" value={filterRol} onChange={(event) => setFilterRol(event.target.value)}>
                <option value="todos">Todos los roles</option><option value="alumno">Alumnos</option><option value="docente">Docentes</option>
              </select>
            </div>

            <div className="admin-users-table-wrap">
              <table className="admin-users-table">
                <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th className="admin-users-actions-heading">Acciones</th></tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan="4" className="admin-users-empty">Cargando usuarios…</td></tr>
                    : filteredUsers.length === 0 ? <tr><td colSpan="4" className="admin-users-empty">No se encontraron usuarios con esos filtros.</td></tr>
                      : filteredUsers.map((user) => (
                        <tr key={user._id}>
                          <td><div className="admin-users-person"><span className="admin-users-avatar">{String(user.nombre || user.email || 'U').slice(0, 1).toUpperCase()}</span><div><strong>{[user.nombre, user.apellido].filter(Boolean).join(' ') || 'Sin nombre'}</strong><small>{user.email}</small></div></div></td>
                          <td><span className={`admin-users-role admin-users-role-${user.rol === 'docente' || user.rol === 'profesor' ? 'teacher' : user.rol === 'admin' ? 'admin' : 'student'}`}>{etiquetaRol(user.rol)}</span></td>
                          <td><span className={`admin-users-status ${user.activo === false ? 'is-inactive' : ''}`}><i />{user.activo === false ? 'Inactivo' : 'Activo'}</span></td>
                          <td className="admin-users-actions-cell"><button type="button" onClick={() => handleDelete(user)} disabled={deletingId === user._id || user.rol === 'admin'} className="admin-users-icon-button" title={user.rol === 'admin' ? 'La cuenta administradora no se desactiva desde aquí' : 'Desactivar usuario'} aria-label={`Desactivar a ${user.nombre || user.email}`}><Trash2 size={17} /></button></td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
