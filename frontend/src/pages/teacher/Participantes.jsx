import React, { useState, useEffect, useContext, useMemo } from 'react';
import { UserPlus, UserMinus, Search, Pencil, Trash2, Copy, Check, X, Plus, Mail } from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import api from '../../services/api';
import './Participantes.css';

// Participantes / matrícula (RF-02 y RF-03 del documento Scrum) + matrícula en cursos.
// - "Todos los usuarios": gestión general (alta, edición y baja lógica). Admin ve todos los roles; docente solo alumnos.
// - Un curso seleccionado: muestra sus alumnos y permite matricular alumnos ya registrados
//   o registrar uno nuevo (que queda matriculado automáticamente en ese curso).

const FORM_VACIO = { dni: '', nombre: '', apellido: '', email: '', rol: '', grado: '4to', seccion: 'A', password: '' };
const CURSO_VACIO = { nombre: 'Comprensión lectora', grado: '4to', seccion: 'A' };
const SECCIONES = ['A', 'B', 'C', 'D', 'E'];
const ROL_ETIQUETA = { alumno: 'Alumno', docente: 'Docente', profesor: 'Docente', admin: 'Administrador' };

const mensajeDe = (err, porDefecto) =>
  err.response?.data?.message || err.response?.data?.mensaje || porDefecto;

const nombreCompleto = (u) => `${u.nombre || ''} ${u.apellido || ''}`.trim() || 'Sin nombre';
const etiquetaCurso = (c) => (c ? `${c.nombre} ${c.grado} ${c.seccion}` : '');

export default function Participantes() {
  const { user } = useContext(AuthContext);
  const esAdmin = user?.rol === 'admin';

  const [vista, setVista] = useState('lista'); // 'lista' | 'form' | 'matricular' | 'curso'
  const [users, setUsers] = useState([]);
  const [cursos, setCursos] = useState([]);
  const [cursoId, setCursoId] = useState(''); // '' = todos los usuarios
  const [alumnosCurso, setAlumnosCurso] = useState([]);
  const [seleccion, setSeleccion] = useState([]); // ids marcados en la vista "matricular"
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroRol, setFiltroRol] = useState('todos');
  const [form, setForm] = useState(FORM_VACIO);
  const [editId, setEditId] = useState(null);
  const [formCurso, setFormCurso] = useState(CURSO_VACIO);
  const [editCursoId, setEditCursoId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [credencial, setCredencial] = useState(null); // contraseña temporal, se muestra una sola vez
  const [copiado, setCopiado] = useState(false);
  const [enviandoCorreo, setEnviandoCorreo] = useState(false);

  const cursoActual = cursos.find((c) => c._id === cursoId) || null;
  const enCurso = Boolean(cursoActual);

  // ───────────── Carga de datos ─────────────
  const cargar = async () => {
    setCargando(true);
    try {
      const res = await api.get('/auth/users');
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo cargar la lista de usuarios'));
    } finally {
      setCargando(false);
    }
  };

  const cargarCursos = async () => {
    try {
      const res = await api.get('/cursos');
      const lista = Array.isArray(res.data) ? res.data : [];
      setCursos(lista);
      return lista;
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo cargar la lista de cursos'));
      return [];
    }
  };

  const cargarAlumnosCurso = async (id) => {
    if (!id) { setAlumnosCurso([]); return; }
    try {
      const res = await api.get(`/cursos/${id}`);
      const lista = Array.isArray(res.data?.alumnos) ? res.data.alumnos : [];
      lista.sort((a, b) => `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`, 'es'));
      setAlumnosCurso(lista);
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo cargar los alumnos del curso'));
    }
  };

  useEffect(() => { cargar(); cargarCursos(); }, []);
  useEffect(() => { cargarAlumnosCurso(cursoId); }, [cursoId]);

  // Refresca la lista de alumnos del curso y los contadores del selector
  const refrescarCurso = async () => {
    await Promise.all([cargarCursos(), cargarAlumnosCurso(cursoId)]);
  };

  const cambiarCurso = (id) => {
    setCursoId(id);
    setBusqueda('');
    setError('');
    setAviso('');
    setCredencial(null);
  };

  // ───────────── Usuarios (formulario "Nuevo usuario") ─────────────
  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const cambiarDni = (e) => setForm({ ...form, dni: e.target.value.replace(/\D/g, '').slice(0, 8) });

  const abrirNuevo = () => {
    setEditId(null);
    setForm(
      enCurso
        ? { ...FORM_VACIO, rol: 'alumno', grado: cursoActual.grado, seccion: cursoActual.seccion }
        : { ...FORM_VACIO, rol: esAdmin ? '' : 'alumno' }
    );
    setError('');
    setAviso('');
    setCredencial(null);
    setVista('form');
  };

  const abrirEdicion = (u) => {
    setEditId(u._id);
    setForm({
      dni: u.dni || '', nombre: u.nombre || '', apellido: u.apellido || '', email: u.email || '',
      rol: u.rol === 'profesor' ? 'docente' : u.rol, grado: u.grado || '4to', seccion: u.seccion || 'A', password: '',
    });
    setError('');
    setAviso('');
    setCredencial(null);
    setVista('form');
  };

  const cancelar = () => {
    setVista('lista');
    setEditId(null);
    setSeleccion([]);
    setBusqueda('');
    setError('');
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    setGuardando(true);

    const payload = {
      dni: form.dni, nombre: form.nombre, apellido: form.apellido, email: form.email, rol: form.rol,
    };
    if (form.rol === 'alumno') { payload.grado = form.grado; payload.seccion = form.seccion; }
    if (editId && form.password) payload.password = form.password;

    try {
      if (editId) {
        await api.put(`/auth/users/${editId}`, payload);
        setAviso('Usuario actualizado con éxito.');
      } else {
        const res = await api.post('/auth/users', payload);
        let matriculado = false;

        // Con un curso seleccionado, el alumno nuevo queda matriculado en él.
        if (enCurso && payload.rol === 'alumno' && res.data?.user?.id) {
          try {
            await api.post(`/cursos/${cursoId}/matricular`, { alumnos: [res.data.user.id] });
            matriculado = true;
          } catch (errMat) {
            setError(`El alumno se registró, pero no se pudo matricular en el curso: ${mensajeDe(errMat, 'error desconocido')}`);
          }
        }
        setAviso(matriculado ? 'Alumno registrado y matriculado en el curso.' : 'Usuario matriculado con éxito.');

        if (res.data?.passwordTemporal) {
          setCredencial({
            id: res.data.user?.id || res.data.user?._id,
            nombre: `${form.nombre} ${form.apellido}`.trim(),
            email: form.email.toLowerCase(),
            dni: form.dni,
            password: res.data.passwordTemporal,
            emailEnviado: Boolean(res.data.emailEnviado),
            avisoCorreo: res.data.avisoCorreo || '',
          });
        }
      }
      setVista('lista');
      setEditId(null);
      await cargar();
      if (cursoId) await refrescarCurso();
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo guardar el usuario'));
    } finally {
      setGuardando(false);
    }
  };

  // Eliminación lógica: el usuario queda inactivo, no se borra de la base de datos
  const eliminar = async (u) => {
    if (!window.confirm(`¿Eliminar a ${nombreCompleto(u)}? Ya no podrá iniciar sesión.`)) return;
    setError('');
    setAviso('');
    try {
      await api.delete(`/auth/users/${u._id}`);
      setAviso('Usuario eliminado.');
      cargar();
      cargarCursos();
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo eliminar el usuario'));
    }
  };

  const copiarCredencial = async () => {
    if (!credencial) return;
    const texto = `Usuario: ${credencial.email} (o DNI ${credencial.dni})\nContraseña temporal: ${credencial.password}`;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* si el navegador bloquea el portapapeles, la clave sigue visible en pantalla */
    }
  };

  const reenviarCorreo = async () => {
    if (!credencial?.id) return;
    setEnviandoCorreo(true);
    try {
      const res = await api.post(`/auth/users/${credencial.id}/send-credentials`, { password: credencial.password });
      setCredencial({ ...credencial, emailEnviado: true, avisoCorreo: '' });
      setAviso(res.data?.message || 'Credenciales enviadas por correo.');
    } catch (err) {
      const mensaje = mensajeDe(err, 'No se pudo enviar el correo.');
      setCredencial({ ...credencial, emailEnviado: false, avisoCorreo: mensaje });
    } finally {
      setEnviandoCorreo(false);
    }
  };

  // ───────────── Cursos ─────────────
  const abrirNuevoCurso = () => {
    setEditCursoId(null);
    setFormCurso(CURSO_VACIO);
    setError('');
    setAviso('');
    setVista('curso');
  };

  const abrirEdicionCurso = () => {
    if (!cursoActual) return;
    setEditCursoId(cursoActual._id);
    setFormCurso({ nombre: cursoActual.nombre, grado: cursoActual.grado, seccion: cursoActual.seccion });
    setError('');
    setAviso('');
    setVista('curso');
  };

  const guardarCurso = async (e) => {
    e.preventDefault();
    setError('');
    setGuardando(true);
    const payload = { nombre: formCurso.nombre.trim(), grado: formCurso.grado, seccion: formCurso.seccion };
    try {
      const res = editCursoId
        ? await api.put(`/cursos/${editCursoId}`, payload)
        : await api.post('/cursos', payload);
      await cargarCursos();
      setCursoId(res.data?._id || editCursoId || '');
      setAviso(editCursoId ? 'Curso actualizado.' : 'Curso creado. Ahora puedes matricular alumnos.');
      setVista('lista');
      setEditCursoId(null);
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo guardar el curso'));
    } finally {
      setGuardando(false);
    }
  };

  const eliminarCurso = async () => {
    if (!cursoActual) return;
    if (!window.confirm(`¿Eliminar el curso «${etiquetaCurso(cursoActual)}»? Los alumnos no se borran: solo dejan de estar matriculados en él.`)) return;
    setError('');
    setAviso('');
    try {
      await api.delete(`/cursos/${cursoActual._id}`);
      setCursoId('');
      await cargarCursos();
      setAviso('Curso eliminado.');
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo eliminar el curso'));
    }
  };

  // ───────────── Matrícula en el curso ─────────────
  const abrirMatricular = () => {
    setSeleccion([]);
    setBusqueda('');
    setError('');
    setAviso('');
    setCredencial(null);
    setVista('matricular');
  };

  const matricular = async (cuerpo) => {
    setError('');
    setGuardando(true);
    try {
      const res = await api.post(`/cursos/${cursoId}/matricular`, cuerpo);
      setAviso(res.data?.message || 'Alumnos matriculados.');
      setSeleccion([]);
      setBusqueda('');
      setVista('lista');
      await refrescarCurso();
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo matricular a los alumnos'));
    } finally {
      setGuardando(false);
    }
  };

  const quitarDelCurso = async (u) => {
    if (!window.confirm(`¿Retirar a ${nombreCompleto(u)} de ${etiquetaCurso(cursoActual)}? Su cuenta sigue activa.`)) return;
    setError('');
    setAviso('');
    try {
      await api.delete(`/cursos/${cursoId}/alumnos/${u._id}`);
      setAviso('Alumno retirado del curso.');
      await refrescarCurso();
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo retirar al alumno'));
    }
  };

  const alternarSeleccion = (id) =>
    setSeleccion((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // ───────────── Filtros ─────────────
  const coincide = (u) => {
    const q = busqueda.trim().toLowerCase();
    return (
      !q ||
      `${u.nombre || ''} ${u.apellido || ''}`.toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.dni || '').includes(q)
    );
  };

  const visibles = (enCurso ? alumnosCurso : users).filter(
    (u) => coincide(u) && (enCurso || filtroRol === 'todos' || u.rol === filtroRol)
  );

  const idsEnCurso = useMemo(() => new Set(alumnosCurso.map((a) => a._id)), [alumnosCurso]);
  const candidatos = users.filter((u) => u.rol === 'alumno' && !idsEnCurso.has(u._id) && coincide(u));
  const todosMarcados = candidatos.length > 0 && candidatos.every((u) => seleccion.includes(u._id));
  const alternarTodos = () =>
    setSeleccion(todosMarcados ? seleccion.filter((id) => !candidatos.some((u) => u._id === id)) : [...new Set([...seleccion, ...candidatos.map((u) => u._id)])]);

  // ───────────── Vista: formulario "Nuevo curso" ─────────────
  if (vista === 'curso') {
    return (
      <div className="pt-page">
        <h2 className="pt-form-title">{editCursoId ? 'Editar curso' : 'Nuevo curso'}</h2>
        {error && <div className="pt-alert pt-alert-error" role="alert">{error}</div>}

        <form className="pt-card pt-form" onSubmit={guardarCurso}>
          <label className="pt-field pt-span-2">
            <span>Nombre del curso *</span>
            <input value={formCurso.nombre} onChange={(e) => setFormCurso({ ...formCurso, nombre: e.target.value })}
              maxLength={120} required />
          </label>
          <label className="pt-field">
            <span>Grado *</span>
            <select value={formCurso.grado} onChange={(e) => setFormCurso({ ...formCurso, grado: e.target.value })} required>
              <option value="4to">4.° de secundaria</option>
            </select>
          </label>
          <label className="pt-field">
            <span>Sección *</span>
            <select value={formCurso.seccion} onChange={(e) => setFormCurso({ ...formCurso, seccion: e.target.value })} required>
              {SECCIONES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>

          <div className="pt-actions">
            <small className="pt-required">* Campos obligatorios</small>
            <div className="pt-buttons">
              <button type="button" className="pt-btn pt-btn-outline" onClick={cancelar}>Cancelar</button>
              <button type="submit" className="pt-btn pt-btn-primary" disabled={guardando}>
                {guardando ? 'Guardando…' : editCursoId ? 'Guardar cambios' : 'Crear curso'}
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  // ───────────── Vista: matricular alumnos ya registrados en el curso ─────────────
  if (vista === 'matricular' && enCurso) {
    return (
      <div className="pt-page">
        <h2 className="pt-form-title">Matricular alumnos en {etiquetaCurso(cursoActual)}</h2>
        {error && <div className="pt-alert pt-alert-error" role="alert">{error}</div>}

        <div className="pt-card">
          <div className="pt-toolbar">
            <div className="pt-search">
              <Search size={16} />
              <input type="text" placeholder="Buscar por nombre, DNI o correo…" value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)} />
            </div>
            <button type="button" className="pt-btn pt-btn-outline pt-btn-sm" onClick={abrirNuevo}>
              <UserPlus size={15} /> Registrar alumno nuevo
            </button>
          </div>

          <div className="pt-table-wrap">
            <table className="pt-table">
              <thead>
                <tr>
                  <th className="pt-check">
                    <input type="checkbox" checked={todosMarcados} onChange={alternarTodos}
                      disabled={candidatos.length === 0} aria-label="Seleccionar todos los alumnos mostrados" />
                  </th>
                  <th>Alumno</th>
                  <th>DNI</th>
                  <th>Grado y sección</th>
                </tr>
              </thead>
              <tbody>
                {candidatos.length === 0 ? (
                  <tr><td colSpan="4" className="pt-vacio">
                    {busqueda
                      ? 'No se encontraron alumnos con ese criterio.'
                      : 'No hay alumnos registrados sin matricular en este curso. Usa «Registrar alumno nuevo».'}
                  </td></tr>
                ) : (
                  candidatos.map((u) => (
                    <tr key={u._id} className={seleccion.includes(u._id) ? 'pt-fila-marcada' : ''}>
                      <td className="pt-check">
                        <input type="checkbox" checked={seleccion.includes(u._id)} onChange={() => alternarSeleccion(u._id)}
                          aria-label={`Seleccionar a ${nombreCompleto(u)}`} />
                      </td>
                      <td>
                        <div className="pt-nombre">{nombreCompleto(u)}</div>
                        <div className="pt-correo">{u.email}</div>
                      </td>
                      <td>{u.dni || '—'}</td>
                      <td>{`${u.grado || '—'} ${u.seccion || ''}`.trim()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="pt-footbar">
            <small className="pt-required">{seleccion.length} seleccionado(s)</small>
            <div className="pt-buttons">
              <button type="button" className="pt-btn pt-btn-outline" onClick={cancelar}>Cancelar</button>
              <button type="button" className="pt-btn pt-btn-outline" disabled={guardando}
                onClick={() => matricular({ seccionCompleta: true })}>
                Matricular toda la sección {cursoActual.grado} {cursoActual.seccion}
              </button>
              <button type="button" className="pt-btn pt-btn-primary" disabled={guardando || seleccion.length === 0}
                onClick={() => matricular({ alumnos: seleccion })}>
                {guardando ? 'Matriculando…' : 'Matricular seleccionados'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ───────────── Vista: formulario "Nuevo usuario" (prototipo RF-02) ─────────────
  if (vista === 'form') {
    const esAlumno = form.rol === 'alumno';
    return (
      <div className="pt-page">
        <h2 className="pt-form-title">
          {editId ? 'Editar usuario' : 'Nuevo usuario'}
          {!editId && enCurso && <span className="pt-subtitulo"> (se matriculará en {etiquetaCurso(cursoActual)})</span>}
        </h2>
        {error && <div className="pt-alert pt-alert-error" role="alert">{error}</div>}

        <form className="pt-card pt-form" onSubmit={guardar}>
          <label className="pt-field">
            <span>DNI *</span>
            <input name="dni" value={form.dni} onChange={cambiarDni} placeholder="8 dígitos"
              inputMode="numeric" pattern="\d{8}" title="El DNI debe tener 8 dígitos" required />
          </label>
          <label className="pt-field">
            <span>Nombres *</span>
            <input name="nombre" value={form.nombre} onChange={cambiar} maxLength={120} required />
          </label>
          <label className="pt-field">
            <span>Apellidos *</span>
            <input name="apellido" value={form.apellido} onChange={cambiar} maxLength={100} required />
          </label>

          <label className="pt-field pt-span-2">
            <span>Correo (cuenta Google) *</span>
            <input type="email" name="email" value={form.email} onChange={cambiar} placeholder="nombre@gmail.com" maxLength={200} required />
          </label>
          <label className="pt-field">
            <span>Rol *</span>
            <select name="rol" value={form.rol} onChange={cambiar} required disabled={!editId && enCurso}>
              <option value="" disabled>Seleccione</option>
              <option value="alumno">Alumno</option>
              {esAdmin && <option value="docente">Docente</option>}
              {esAdmin && <option value="admin">Administrador</option>}
            </select>
          </label>

          <label className="pt-field">
            <span>Grado (alumno)</span>
            <select name="grado" value={form.grado} onChange={cambiar} disabled={!esAlumno} required={esAlumno}>
              <option value="4to">4.° de secundaria</option>
            </select>
          </label>
          <label className="pt-field">
            <span>Sección (alumno)</span>
            <select name="seccion" value={form.seccion} onChange={cambiar} disabled={!esAlumno} required={esAlumno}>
              {SECCIONES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          {editId && (
            <label className="pt-field">
              <span>Nueva contraseña (opcional)</span>
              <input type="password" name="password" value={form.password} onChange={cambiar}
                minLength={6} placeholder="Vacío = no cambiar" autoComplete="new-password" />
            </label>
          )}

          <div className="pt-actions">
            <small className="pt-required">* Campos obligatorios</small>
            <div className="pt-buttons">
              <button type="button" className="pt-btn pt-btn-outline" onClick={cancelar}>Cancelar</button>
              <button type="submit" className="pt-btn pt-btn-primary" disabled={guardando}>
                {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Registrar'}
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  // ───────────── Vista: lista ─────────────
  return (
    <div className="pt-page">
      <div className="pt-banner">
        <h2>{enCurso ? `Alumnos de ${etiquetaCurso(cursoActual)}` : 'Usuarios matriculados'}</h2>
        <div className="pt-banner-actions">
          <select className="pt-curso-select" value={cursoId} onChange={(e) => cambiarCurso(e.target.value)} aria-label="Curso">
            <option value="">Todos los usuarios</option>
            {cursos.map((c) => (
              <option key={c._id} value={c._id}>{`${etiquetaCurso(c)} (${c.totalAlumnos})`}</option>
            ))}
          </select>
          {enCurso && (
            <>
              <button type="button" className="pt-icon-btn" title="Editar curso" aria-label="Editar curso" onClick={abrirEdicionCurso}>
                <Pencil size={16} />
              </button>
              <button type="button" className="pt-icon-btn" title="Eliminar curso" aria-label="Eliminar curso" onClick={eliminarCurso}>
                <Trash2 size={16} />
              </button>
            </>
          )}
          <button type="button" className="pt-btn pt-btn-ghost pt-btn-banner" onClick={abrirNuevoCurso}>
            <Plus size={16} /> Nuevo curso
          </button>
          <button type="button" className="pt-btn pt-btn-primary pt-btn-banner" onClick={enCurso ? abrirMatricular : abrirNuevo}>
            <UserPlus size={16} /> Matricular usuarios
          </button>
        </div>
      </div>

      {error && <div className="pt-alert pt-alert-error" role="alert">{error}</div>}
      {aviso && <div className="pt-alert pt-alert-ok" role="status">{aviso}</div>}
      {!cargando && cursos.length === 0 && (
        <div className="pt-alert pt-alert-info" role="status">
          Aún no hay cursos. Crea uno con «Nuevo curso» para poder matricular alumnos en él.
        </div>
      )}

      {credencial && (
        <div className="pt-alert pt-alert-clave" role="status">
          <div>
            <strong>Contraseña temporal de {credencial.nombre}:</strong>{' '}
            <code className="pt-clave">{credencial.password}</code>
            <p>
              Ingresa con el correo <b>{credencial.email}</b> o con su DNI. Esta contraseña temporal solo se muestra ahora; al cerrar este aviso no se podrá recuperar.
            </p>
            <p role="status" style={{ color: credencial.emailEnviado ? '#166534' : '#92400e' }}>
              {credencial.emailEnviado ? `Correo enviado a ${credencial.email}.` : (credencial.avisoCorreo || 'No se confirmó el envío del correo.')}
            </p>
          </div>
          <div className="pt-clave-botones">
            <button type="button" className="pt-btn pt-btn-outline" onClick={reenviarCorreo} disabled={enviandoCorreo}>
              <Mail size={14} /> {enviandoCorreo ? 'Enviando…' : 'Enviar por correo'}
            </button>
            <button type="button" className="pt-btn pt-btn-outline" onClick={copiarCredencial}>
              {copiado ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar</>}
            </button>
            <button type="button" className="pt-icon-btn" aria-label="Cerrar" onClick={() => setCredencial(null)}>
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="pt-card">
        <div className="pt-toolbar">
          <div className="pt-search">
            <Search size={16} />
            <input type="text" placeholder="Buscar por nombre, DNI o correo…" value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)} />
          </div>
          {esAdmin && !enCurso && (
            <select value={filtroRol} onChange={(e) => setFiltroRol(e.target.value)} aria-label="Filtrar por rol">
              <option value="todos">Todos los roles</option>
              <option value="alumno">Alumnos</option>
              <option value="docente">Docentes</option>
              <option value="admin">Administradores</option>
            </select>
          )}
        </div>

        <div className="pt-table-wrap">
          <table className="pt-table">
            <thead>
              <tr>
                <th>Participante</th>
                <th>DNI</th>
                <th>Rol</th>
                <th>Grado y sección</th>
                <th className="pt-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr><td colSpan="5" className="pt-vacio">Cargando usuarios…</td></tr>
              ) : visibles.length === 0 ? (
                <tr><td colSpan="5" className="pt-vacio">
                  {busqueda || (!enCurso && filtroRol !== 'todos')
                    ? 'No se encontraron registros.'
                    : enCurso
                      ? 'Este curso aún no tiene alumnos. Usa «Matricular usuarios».'
                      : 'Aún no hay usuarios registrados. Usa «Matricular usuarios».'}
                </td></tr>
              ) : (
                visibles.map((u) => (
                  <tr key={u._id}>
                    <td>
                      <div className="pt-nombre">{nombreCompleto(u)}</div>
                      <div className="pt-correo">{u.email}</div>
                    </td>
                    <td>{u.dni || '—'}</td>
                    <td><span className={`pt-chip pt-chip-${u.rol === 'profesor' ? 'docente' : u.rol}`}>{ROL_ETIQUETA[u.rol] || u.rol}</span></td>
                    <td>{u.rol === 'alumno' ? `${u.grado || '—'} ${u.seccion || ''}`.trim() : '—'}</td>
                    <td className="pt-right">
                      <button type="button" className="pt-icon-btn" title="Editar usuario" aria-label="Editar usuario" onClick={() => abrirEdicion(u)}>
                        <Pencil size={16} />
                      </button>
                      {enCurso ? (
                        <button type="button" className="pt-icon-btn pt-icon-danger" title="Retirar del curso" aria-label="Retirar del curso" onClick={() => quitarDelCurso(u)}>
                          <UserMinus size={16} />
                        </button>
                      ) : (
                        <button type="button" className="pt-icon-btn pt-icon-danger" title="Eliminar usuario" aria-label="Eliminar usuario" onClick={() => eliminar(u)}>
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
