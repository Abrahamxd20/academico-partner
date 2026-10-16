import React, { useState, useEffect, useContext, useRef } from 'react';
import {
  LayoutDashboard, Inbox, BookOpen, FileText,
  Grid, Settings, Search, User, RefreshCw, AlertTriangle, Download
} from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import { obtenerResumenDashboard, obtenerActividadAlumnos } from '../../services/dashboardService';
const ReportesDashboard = React.lazy(() => import('./ReportesDashboard'));
import CarpetasAprendizaje from './CarpetasAprendizaje';
import ConfiguracionDocente from './ConfiguracionDocente';
import Participantes from './Participantes';
import CalendarioSesiones from './CalendarioSesiones';
import { listarCursos, crearCurso } from '../../services/cursoService';
import './TeacherDashboard.css';
import { useNavigate } from 'react-router-dom';

function num(valor, decimales = 0) {
  if (valor === undefined || valor === null || isNaN(valor)) return 0;
  return Number(valor.toFixed(decimales));
}

function clamp100(valor) {
  return Math.max(0, Math.min(100, valor || 0));
}

export default function TeacherDashboard() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const [seccionActiva, setSeccionActiva] = useState('cursos');
  const [cursoActivoId, setCursoActivoId] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [actividad, setActividad] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [menuPerfilAbierto, setMenuPerfilAbierto] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const clickFuera = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuPerfilAbierto(false);
    };
    document.addEventListener('mousedown', clickFuera);
    return () => document.removeEventListener('mousedown', clickFuera);
  }, []);

  const cargarDatos = async () => {
    setCargando(true);
    setError(null);
    try {
      const [resumenData, actividadData] = await Promise.all([
        obtenerResumenDashboard(),
        obtenerActividadAlumnos(),
      ]);
      setResumen(resumenData);
      setActividad(Array.isArray(actividadData) ? actividadData : []);
    } catch (err) {
      setError('Error al cargar datos');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  // OJO: los campos usados (Inflesz, ROUGE-L, ROUGE-S) no coinciden con las etiquetas
  // Literal / Inferencial / Crítico. Se dejan igual que tu versión; ver notas en el chat.
  const pLiteral = clamp100(resumen?.promedioInflesz);
  const pInferencial = clamp100((resumen?.promedioRougeL || 0) * 100);
  const pCritico = clamp100((resumen?.promedioRougeS || 0) * 100);

  const metricas = [
    { label: 'Índice Literal (IC)', val: `${num(pLiteral, 1)}%`, percent: pLiteral },
    { label: 'Índice Inferencial (IC)', val: `${num(pInferencial, 1)}%`, percent: pInferencial },
    { label: 'Índice Crítico (IC)', val: `${num(pCritico, 1)}%`, percent: pCritico },
  ];

  const Tabs = [
    { id: 'cursos', label: 'Cursos' },
    { id: 'participantes', label: 'Participantes' },
    { id: 'carpetas', label: 'Carpetas de Aprendizaje' },
    { id: 'calendario', label: 'Calendario' },
    { id: 'reportes', label: 'Reportes' },
    { id: 'settings', label: 'Configuración' }
  ];

  const exportarPDF = () => window.print();

  const [mostrarModalCurso, setMostrarModalCurso] = useState(false);
  const [cursos, setCursos] = useState([]);
  const [errorCursos, setErrorCursos] = useState('');
  const [formCurso, setFormCurso] = useState({ nombre: 'Comprensión lectora', grado: '4to', seccion: 'A' });
  const [guardandoCurso, setGuardandoCurso] = useState(false);

  const cargarCursos = async () => {
    try {
      setCursos(await listarCursos());
      setErrorCursos('');
    } catch {
      setErrorCursos('No se pudieron cargar los cursos.');
    }
  };
  useEffect(() => { cargarCursos(); }, []);

  const guardarCurso = async () => {
    if (!formCurso.nombre.trim()) return;
    setGuardandoCurso(true);
    try {
      await crearCurso({ ...formCurso, nombre: formCurso.nombre.trim() });
      setMostrarModalCurso(false);
      await cargarCursos();
    } catch (err) {
      alert(err.response?.data?.message || 'No se pudo crear el curso');
    } finally {
      setGuardandoCurso(false);
    }
  };

  return (
    <div className="dashboard-container moodle-style">
      <header className="moodle-header">
        <div className="mh-left">
          <button className="mh-hamburger"><LayoutDashboard size={20} /></button>
          <span className="mh-brand">Blackboard Activa</span>
        </div>

        <nav className="mh-nav">
          {Tabs.map(tab => (
            <button
              key={tab.id}
              className={`mh-tab ${seccionActiva === tab.id ? 'active' : ''}`}
              onClick={() => setSeccionActiva(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="mh-right">
          <Inbox size={20} className="mh-icon" />
          <div className="mh-profile" ref={menuRef} style={{ position: 'relative' }} onClick={() => setMenuPerfilAbierto(!menuPerfilAbierto)}>
            <span className="mh-user-name">{user?.nombre || 'Docente'}</span>
            <User size={20} className="mh-avatar" />

            {menuPerfilAbierto && (
              <div style={{ position: 'absolute', top: '100%', right: 0, backgroundColor: 'white', border: '1px solid #dee2e6', borderRadius: '4px', padding: '10px 0', minWidth: '150px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 1000 }}>
                <div style={{ padding: '8px 20px', cursor: 'pointer', color: '#495057' }} onClick={() => setSeccionActiva('settings')}>Perfil</div>
                <div style={{ padding: '8px 20px', cursor: 'pointer', color: '#495057' }} onClick={() => setSeccionActiva('reportes')}>Calificaciones</div>
                <div style={{ padding: '8px 20px', cursor: 'pointer', color: '#495057' }} onClick={() => setSeccionActiva('calendario')}>Calendario</div>
                <hr style={{ margin: '5px 0', border: 'none', borderTop: '1px solid #dee2e6' }} />
                <div style={{ padding: '8px 20px', cursor: 'pointer', color: '#dc3545' }} onClick={() => { logout(); navigate('/'); }}>Cerrar sesión</div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="main-content">
        {seccionActiva === 'cursos' && (
          <div className="dashboard-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2>Mis Cursos</h2>
              <button onClick={() => setMostrarModalCurso(true)} className="sd-btn-exportar" style={{ background: '#0f6cbf', color: 'white', padding: '8px 16px', borderRadius: '4px', border: 'none', cursor: 'pointer' }}>
                + Crear Curso
              </button>
            </div>

            {errorCursos && <p style={{ color: '#dc3545' }}>{errorCursos}</p>}
            {!errorCursos && cursos.length === 0 && (
              <p style={{ color: '#666' }}>Aún no tienes cursos. Crea el primero con «Crear Curso».</p>
            )}

            <div className="grid-two-columns">
              {cursos.map((c) => (
                <div key={c._id} className="card-section" style={{ padding: '20px', borderLeft: '4px solid #0f6cbf' }}>
                  <h3>{c.nombre} {c.grado} «{c.seccion}»</h3>
                  <p style={{ color: '#666', fontSize: '0.9rem', marginTop: '10px' }}>{c.totalAlumnos} alumno(s) matriculado(s)</p>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '15px' }}>
                    <button onClick={() => { setCursoActivoId(c._id); setSeccionActiva('carpetas'); }} style={{ background: 'transparent', border: '1px solid #0f6cbf', color: '#0f6cbf', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}>Ir al curso</button>
                    <button onClick={() => setSeccionActiva('participantes')} style={{ background: 'transparent', border: '1px solid #0f6cbf', color: '#0f6cbf', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}>Participantes</button>
                  </div>
                </div>
              ))}
            </div>

            {mostrarModalCurso && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                <div style={{ background: 'white', padding: '20px', borderRadius: '8px', width: '400px' }}>
                  <h3>Crear Nuevo Curso</h3>
                  <input type="text" placeholder="Nombre del curso" value={formCurso.nombre}
                    onChange={(e) => setFormCurso({ ...formCurso, nombre: e.target.value })}
                    style={{ width: '100%', padding: '10px', margin: '15px 0', border: '1px solid #ccc', borderRadius: '4px' }} />
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                    <select value={formCurso.grado} onChange={(e) => setFormCurso({ ...formCurso, grado: e.target.value })} style={{ flex: 1, padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }}>
                      <option value="4to">4.° de secundaria</option>
                    </select>
                    <select value={formCurso.seccion} onChange={(e) => setFormCurso({ ...formCurso, seccion: e.target.value })} style={{ flex: 1, padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }}>
                      {['A', 'B', 'C', 'D', 'E'].map((x) => <option key={x} value={x}>Sección {x}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button onClick={() => setMostrarModalCurso(false)} style={{ padding: '8px 16px', background: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancelar</button>
                    <button onClick={guardarCurso} disabled={guardandoCurso} style={{ padding: '8px 16px', background: '#0f6cbf', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{guardandoCurso ? 'Guardando…' : 'Guardar'}</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {seccionActiva === 'participantes' && (
          <div className="dashboard-body">
            <Participantes />
          </div>
        )}

        {seccionActiva === 'reportes' && (
          <div className="dashboard-body">
            <section className="card-section" id="seccion-metricas" style={{ marginBottom: '20px' }}>
              <div className="card-header-blue" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Métricas de Comprensión (Promedios Globales) {cargando && '· cargando...'}</span>
                <button onClick={exportarPDF} className="sd-btn-exportar" style={{ background: '#fff', color: '#1e3a8a', padding: '5px 10px', borderRadius: '4px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px' }}>
                  <Download size={15} /> Exportar PDF
                </button>
              </div>
              <div className="metrics-circles-grid">
                {metricas.map((item, idx) => (
                  <div key={idx} className="circle-item">
                    <div className="circle-outer" style={{ background: `conic-gradient(#00d2ff ${item.percent * 3.6}deg, #e2e8f0 0deg)` }}>
                      <div className="circle-inner">{item.val}</div>
                    </div>
                    <span className="circle-label">{item.label}</span>
                  </div>
                ))}
              </div>
            </section>
            <React.Suspense fallback={<div style={{ padding: 24 }}>Cargando reportes…</div>}><ReportesDashboard /></React.Suspense>
          </div>
        )}

        {seccionActiva === 'carpetas' && (
          <CarpetasAprendizaje cursos={cursos} cursoId={cursoActivoId} onCambiarCurso={setCursoActivoId} />
        )}
        {seccionActiva === 'calendario' && (
          <CalendarioSesiones cursos={cursos} onAbrirCurso={(id) => { setCursoActivoId(id); setSeccionActiva('carpetas'); }} />
        )}
        {seccionActiva === 'settings' && <ConfiguracionDocente />}
      </main>
    </div>
  );
}
