import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Plus, Pencil, Trash2, X, Users } from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import { normalizarRol } from '../../utils/roles';
import { listarCursos, crearCurso, actualizarCurso, eliminarCurso } from '../../services/cursoService';
import './Cursos.css';

const SECCIONES = ['A', 'B', 'C', 'D', 'E'];
const VACIO = { nombre: '', descripcion: '', institucion: '', areaCurricular: '', referenciaCurricular: '', competencias: '', programacionCurricular: '', grado: '4to', seccion: 'A' };

export default function CursosLista() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const esDocente = ['docente', 'admin'].includes(normalizarRol(user?.rol));

  const [cursos, setCursos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null); // null = cerrado; { _id?, ...campos }
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    setError('');
    try {
      setCursos(await listarCursos());
    } catch {
      setError('No se pudieron cargar los cursos.');
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []);

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const { _id, ...datos } = form;
      datos.competencias = String(datos.competencias || '').split('\n').map((item) => item.trim()).filter(Boolean);
      if (_id) await actualizarCurso(_id, datos); else await crearCurso(datos);
      setForm(null);
      await cargar();
    } catch (err) {
      alert(err.response?.data?.message || 'No se pudo guardar el curso');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (c) => {
    if (!window.confirm(`¿Eliminar el curso "${c.nombre}"? Los alumnos dejarán de verlo.`)) return;
    try { await eliminarCurso(c._id); await cargar(); }
    catch (err) { alert(err.response?.data?.message || 'No se pudo eliminar'); }
  };

  return (
    <div className="cu-page">
      <header className="cu-topbar">
        <h1 className="cu-brand">Mis cursos</h1>
        <span className="cu-user">{user?.nombre}</span>
      </header>

      <main className="cu-main">
        {esDocente && (
          <div className="cu-toolbar">
            <button className="cu-btn cu-btn-primary" onClick={() => setForm({ ...VACIO })}>
              <Plus size={16} /> Nuevo curso
            </button>
          </div>
        )}

        {error && <p className="cu-error">{error}</p>}
        {cargando && <p className="cu-muted">Cargando cursos…</p>}
        {!cargando && !error && cursos.length === 0 && (
          <p className="cu-empty">
            {esDocente ? 'Aún no has creado ningún curso. Crea el primero con “Nuevo curso”.'
                       : 'Todavía no tienes cursos asignados a tu grado y sección.'}
          </p>
        )}

        <div className="cu-grid">
          {cursos.map((c) => (
            <article key={c._id} className="cu-card" onClick={() => navigate(`/cursos/${c._id}`)}>
              <div className="cu-card-icon"><BookOpen size={22} /></div>
              <h2>{c.nombre}</h2>
              {c.descripcion && <p className="cu-desc">{c.descripcion}</p>}
              <p className="cu-meta"><Users size={14} /> {c.grado} “{c.seccion}”</p>
              <p className="cu-meta">{c.totalSesiones} sesiones · {c.totalActividades} actividades</p>
              {!esDocente && c.docente && <p className="cu-meta">Prof. {c.docente.nombre} {c.docente.apellido}</p>}
              {esDocente && (
                <div className="cu-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="cu-icon-btn" title="Editar" onClick={() => setForm({ _id: c._id, nombre: c.nombre, descripcion: c.descripcion, institucion: c.institucion || '', areaCurricular: c.areaCurricular || '', referenciaCurricular: c.referenciaCurricular || '', competencias: (c.competencias || []).join('\n'), programacionCurricular: c.programacionCurricular || '', grado: c.grado, seccion: c.seccion })}><Pencil size={15} /></button>
                  <button className="cu-icon-btn cu-danger" title="Eliminar" onClick={() => borrar(c)}><Trash2 size={15} /></button>
                </div>
              )}
            </article>
          ))}
        </div>
      </main>

      {form && (
        <div className="cu-overlay" onClick={() => setForm(null)}>
          <form className="cu-modal" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
            <div className="cu-modal-head">
              <h3>{form._id ? 'Editar curso' : 'Nuevo curso'}</h3>
              <button type="button" className="cu-icon-btn" onClick={() => setForm(null)}><X size={18} /></button>
            </div>
            <label>Nombre del curso
              <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Comprensión lectora" />
            </label>
            <label>Descripción (opcional)
              <textarea rows={3} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
            </label>
            <h4 className="cu-sub">Alineación con el plan curricular</h4>
            <label>Institución educativa
              <input value={form.institucion} maxLength={180} onChange={(e) => setForm({ ...form, institucion: e.target.value })} placeholder="Nombre del colegio" />
            </label>
            <div className="cu-row">
              <label>Área curricular
                <input value={form.areaCurricular} maxLength={120} onChange={(e) => setForm({ ...form, areaCurricular: e.target.value })} placeholder="Comunicación" />
              </label>
              <label>Referencia del sílabo o programación
                <input value={form.referenciaCurricular} maxLength={300} onChange={(e) => setForm({ ...form, referenciaCurricular: e.target.value })} placeholder="Año, unidad o documento" />
              </label>
            </div>
            <label>Competencias del curso (una por línea)
              <textarea rows={3} value={Array.isArray(form.competencias) ? form.competencias.join('\n') : form.competencias} onChange={(e) => setForm({ ...form, competencias: e.target.value })} placeholder="Lee diversos tipos de textos escritos…" />
            </label>
            <label>Extracto de la programación curricular
              <textarea rows={4} maxLength={8000} value={form.programacionCurricular} onChange={(e) => setForm({ ...form, programacionCurricular: e.target.value })} placeholder="Incluye unidad, capacidades, desempeños u objetivos del periodo que orienten al asistente." />
            </label>
            <div className="cu-row">
              <label>Grado
                <select value={form.grado} onChange={(e) => setForm({ ...form, grado: e.target.value })}>
                  <option value="4to">4to de secundaria</option>
                </select>
              </label>
              <label>Sección
                <select value={form.seccion} onChange={(e) => setForm({ ...form, seccion: e.target.value })}>
                  {SECCIONES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>
            <p className="cu-muted">Los alumnos de este grado y sección verán el curso automáticamente.</p>
            <div className="cu-modal-foot">
              <button type="button" className="cu-btn" onClick={() => setForm(null)}>Cancelar</button>
              <button type="submit" className="cu-btn cu-btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
