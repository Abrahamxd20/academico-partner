import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Folder, FolderOpen, ChevronDown, ChevronUp, ArrowLeft, Plus, Pencil, Trash2,
  Eye, EyeOff, X, FileText, ClipboardList, PlayCircle, MessageCircle, ExternalLink, Sparkles, Loader2
} from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import {
  obtenerCurso, crearSesion, actualizarSesion, eliminarSesion,
  crearActividad, actualizarActividad, eliminarActividad, listarLecturas,
} from '../../services/cursoService';
import { subirLecturaPdf } from '../../services/bibliotecaService';
import api from '../../services/api';
import { API_BASE_URL } from '../../config';
import { io } from 'socket.io-client';
import './Cursos.css';

const API_BASE = API_BASE_URL;
const socket = io(API_BASE);

const NIVELES_BASE = [
  { nombre: 'Logrado', puntos: 4, descriptor: '' },
  { nombre: 'En proceso', puntos: 2, descriptor: '' },
  { nombre: 'Inicio', puntos: 0, descriptor: '' },
];
const criterioNuevo = () => ({ codigo: '', nombre: '', objetivo: '', niveles: NIVELES_BASE.map((n) => ({ ...n })) });

const formatearFecha = (f) =>
  f ? new Date(f).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Lima' }) + ' (UTC-5)' : null;

const aInputFecha = (f) => {
  if (!f) return '';
  const d = new Date(f);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const puntajeMaximo = (rubrica) =>
  (rubrica?.criterios || []).reduce((s, c) => s + Math.max(0, ...c.niveles.map((n) => n.puntos)), 0);

function RubricaTabla({ rubrica }) {
  const criterios = rubrica?.criterios || [];
  if (!criterios.length) return <p className="cu-muted">Esta actividad aún no tiene rúbrica.</p>;
  return (
    <div className="cu-rubrica">
      <table>
        <thead><tr><th>Criterio</th><th>Niveles de logro</th></tr></thead>
        <tbody>
          {criterios.map((c, i) => (
            <tr key={i}>
              <td className="cu-crit">
                {c.codigo && <small>{c.codigo} · </small>}{c.nombre}
                {c.objetivo && <p className="cu-crit-objetivo">Objetivo: {c.objetivo}</p>}
              </td>
              <td>
                <div className="cu-niveles">
                  {c.niveles.map((n, j) => (
                    <div key={j} className="cu-nivel">
                      <strong>{n.nombre}</strong> <span className="cu-pts">{n.puntos} pts</span>
                      {n.descriptor && <p>{n.descriptor}</p>}
                    </div>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="cu-total">Puntaje máximo: <strong>{puntajeMaximo(rubrica)} pts</strong></p>
    </div>
  );
}

function RubricaEditor({ value, onChange }) {
  const criterios = value.criterios || [];
  const setCriterios = (c) => onChange({ criterios: c });
  const setCrit = (i, patch) => setCriterios(criterios.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const setNivel = (i, j, patch) => {
    const criterio = criterios[i];
    if (!criterio || !criterio.niveles) return;
    setCrit(i, { niveles: criterio.niveles.map((n, k) => (k === j ? { ...n, ...patch } : n)) });
  };

  return (
    <div className="cu-reditor">
      {criterios.map((c, i) => (
        <div key={i} className="cu-crit-box">
          <div className="cu-crit-head">
            <input placeholder="Criterio (p. ej. Comprensión literal)" value={c.nombre} onChange={(e) => setCrit(i, { nombre: e.target.value })} />
            <button type="button" className="cu-icon-btn cu-danger" title="Quitar criterio" onClick={() => setCriterios(criterios.filter((_, k) => k !== i))}><Trash2 size={15} /></button>
          </div>
          <div className="cu-crit-meta">
            <input placeholder="Código (p. ej. COM-01)" maxLength={40} value={c.codigo || ''} onChange={(e) => setCrit(i, { codigo: e.target.value })} />
            <input placeholder="Objetivo de aprendizaje relacionado" maxLength={300} value={c.objetivo || ''} onChange={(e) => setCrit(i, { objetivo: e.target.value })} />
          </div>
          {c.niveles.map((n, j) => (
            <div key={j} className="cu-nivel-row">
              <input className="cu-n-nombre" placeholder="Nivel" value={n.nombre} onChange={(e) => setNivel(i, j, { nombre: e.target.value })} />
              <input className="cu-n-pts" type="number" min="0" step="0.5" value={n.puntos} onChange={(e) => setNivel(i, j, { puntos: e.target.value })} />
              <input className="cu-n-desc" placeholder="Descriptor: qué debe cumplir el alumno" value={n.descriptor} onChange={(e) => setNivel(i, j, { descriptor: e.target.value })} />
              <button type="button" className="cu-icon-btn" title="Quitar nivel" disabled={c.niveles.length <= 1}
                onClick={() => setCrit(i, { niveles: c.niveles.filter((_, k) => k !== j) })}><X size={14} /></button>
            </div>
          ))}
          <button type="button" className="cu-link" onClick={() => setCrit(i, { niveles: [...c.niveles, { nombre: '', puntos: 0, descriptor: '' }] })}>+ Agregar nivel</button>
        </div>
      ))}
      <button type="button" className="cu-btn" onClick={() => setCriterios([...criterios, criterioNuevo()])}><Plus size={14} /> Agregar criterio</button>
      {criterios.length > 0 && <p className="cu-total">Puntaje máximo: <strong>{puntajeMaximo(value)} pts</strong></p>}
    </div>
  );
}

const NIVELES_PREGUNTA = [
  { id: 'literal', label: 'Literal' },
  { id: 'inferencial', label: 'Inferencial' },
  { id: 'critico', label: 'Crítico' },
];

// Componente controlado: todo el estado vive en `value` (modal.datos), así no hay copias desfasadas.
function PreguntasEditor({ value, onChange, lecturaId, modo, onGenerating, generando, archivo, tituloActividad, onLecturaSubida }) {
  const [fuente, setFuente] = useState(null);
  const preguntas = value?.preguntasOpcionMultiple || [];
  const pregLiteral = value?.preguntaLiteral || { enunciado: '' };
  const pregInfer = value?.preguntaInferencial || { enunciado: '', respuestaReferencia: '' };
  const pregCrit = value?.preguntaCritico || { enunciado: '', respuestaReferencia: '' };

  const setPreguntas = (nuevas) => onChange({ preguntasOpcionMultiple: nuevas });

  const agregarPregunta = () => {
    const nueva = {
      id: preguntas.length + 1,
      nivel: 'literal',
      enunciado: '',
      opciones: [
        { id: 'A', texto: '' }, { id: 'B', texto: '' }, { id: 'C', texto: '' }, { id: 'D', texto: '' },
      ],
      respuestaCorrecta: 'A',
    };
    setPreguntas([...preguntas, nueva]);
  };

  const updatePregunta = (idx, patch) =>
    setPreguntas(preguntas.map((q, k) => (k === idx ? { ...q, ...patch } : q)));

  const updateOpcion = (qIdx, oIdx, texto) =>
    setPreguntas(preguntas.map((q, k) => (k !== qIdx ? q : {
      ...q,
      opciones: q.opciones.map((op, m) => (m === oIdx ? { ...op, texto } : op)),
    })));

  const quitarPregunta = (idx) => setPreguntas(preguntas.filter((_, k) => k !== idx));

  const generarIA = async () => {
    let idLectura = lecturaId;
    onGenerating(true);
    try {
      // PDF nuevo seleccionado: se sube primero y se genera SIEMPRE con ese archivo
      // (nunca con el id de una lectura anterior que haya quedado en el formulario).
      const subirNuevo = modo === 'subir';
      if (subirNuevo || !idLectura) {
        if (!archivo) return alert(subirNuevo ? 'Selecciona primero el archivo PDF.' : 'Elige una lectura de tu biblioteca.');
        const resp = await subirLecturaPdf({ file: archivo, titulo: tituloActividad });
        idLectura = resp?.libro?._id;
        if (!idLectura) throw new Error('El servidor no devolvió la lectura subida');
        onLecturaSubida(idLectura);
      }

      const res = await api.post('/cursos/generar-preguntas', { lecturaId: idLectura });
      const data = res.data;
      setFuente(data.fuente || null);
      const generadas = {
        preguntasOpcionMultiple: data.preguntasOpcionMultiple || [],
        preguntaLiteral: data.preguntaLiteral || { enunciado: '' },
        preguntaInferencial: data.preguntaInferencial || { enunciado: '', respuestaReferencia: '' },
        preguntaCritico: data.preguntaCritico || { enunciado: '', respuestaReferencia: '' },
      };
      onChange(generadas);

      // Se guardan de inmediato en la lectura: así no se pierden si se cierra o recarga la ventana.
      try {
        await api.put(`/biblioteca/${idLectura}/preguntas`, generadas);
        setFuente((f) => (f ? { ...f, guardadas: true } : { guardadas: true }));
      } catch (e) {
        console.error('No se pudieron guardar las preguntas generadas:', e);
        alert('Las preguntas se generaron, pero no se pudieron guardar todavía. Pulsa «Guardar» para intentarlo de nuevo.');
      }
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Error al generar preguntas con IA');
    } finally {
      onGenerating(false);
    }
  };

  const boxStyle = { border: '1px solid #e2e8f0', padding: '12px', borderRadius: '8px', background: '#f8fafc' };
  const areaStyle = { width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', minHeight: '60px' };

  return (
    <div className="cu-preguntas-editor">
      <div className="cu-preg-header">
        <h4 style={{ margin: '0', fontSize: '1.1rem', color: '#1e3a8a' }}>Preguntas de Comprensión</h4>
        <button
          type="button"
          className="cu-btn cu-btn-ia"
          onClick={generarIA}
          disabled={generando}
          style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: generando ? 'wait' : 'pointer', opacity: generando ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}
        >
          {generando ? <Loader2 size={14} /> : <Sparkles size={14} />} {generando ? 'Generando…' : 'Generar con IA'}
        </button>
      </div>

      {fuente && (
        <p style={{ margin: '10px 0 0', padding: '8px 10px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', fontSize: '0.85rem', color: '#065f46' }}>
          ✔ Preguntas generadas a partir de <strong>«{fuente.archivo || fuente.titulo || 'el archivo seleccionado'}»</strong> ({Number(fuente.caracteres || 0).toLocaleString('es-PE')} caracteres leídos). {fuente.guardadas ? 'Ya quedaron guardadas; puedes editarlas y pulsar «Guardar».' : 'Revísalas antes de guardar.'}
        </p>
      )}

      <div className="cu-preg-list" style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '15px' }}>
        <p className="cu-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
          Cada pregunta tiene 4 alternativas. Marca el círculo de la alternativa <strong>correcta</strong> (se resalta en verde).
        </p>
        {preguntas.map((q, i) => {
          const colorNivel = { literal: '#0369a1', inferencial: '#7c3aed', critico: '#b45309' }[q.nivel || 'literal'];
          return (
            <div key={i} className="cu-preg-card" style={{ border: '1px solid #e2e8f0', borderLeft: `4px solid ${colorNivel}`, padding: '15px', borderRadius: '8px', background: '#fcfcfc' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ background: '#e2e8f0', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold', flex: '0 0 auto' }}>Pregunta {i + 1}</span>
                <select
                  value={q.nivel || 'literal'}
                  onChange={(e) => updatePregunta(i, { nivel: e.target.value })}
                  style={{ width: 'auto', flex: '0 0 auto', padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', color: colorNivel, fontWeight: 600 }}
                >
                  {NIVELES_PREGUNTA.map((n) => <option key={n.id} value={n.id}>Nivel {n.label}</option>)}
                </select>
                <span style={{ flex: 1 }} />
                <button type="button" className="cu-icon-btn cu-danger" title="Quitar pregunta" onClick={() => quitarPregunta(i)}><Trash2 size={14} /></button>
              </div>

              <textarea
                className="cu-preg-input"
                placeholder="Escribe aquí el enunciado de la pregunta..."
                rows={2}
                value={q.enunciado}
                onChange={(e) => updatePregunta(i, { enunciado: e.target.value })}
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', marginBottom: '10px', fontWeight: 600 }}
              />

              <div className="cu-opciones-grid" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {q.opciones.map((op, j) => {
                  const correcta = q.respuestaCorrecta === op.id;
                  return (
                    <div
                      key={op.id}
                      className="cu-op-row"
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', borderRadius: '6px', border: `1px solid ${correcta ? '#16a34a' : '#e2e8f0'}`, background: correcta ? '#f0fdf4' : '#fff' }}
                    >
                      <input
                        type="radio"
                        name={`correct-${i}`}
                        title="Marcar como respuesta correcta"
                        checked={correcta}
                        onChange={() => updatePregunta(i, { respuestaCorrecta: op.id })}
                        style={{ width: 'auto', flex: '0 0 auto', margin: 0 }}
                      />
                      <span style={{ fontWeight: 'bold', fontSize: '0.85rem', flex: '0 0 auto', width: '1.2rem' }}>{op.id}</span>
                      <input
                        className="cu-op-input"
                        placeholder={`Alternativa ${op.id}`}
                        value={op.texto}
                        onChange={(e) => updateOpcion(i, j, e.target.value)}
                        style={{ flex: 1, minWidth: 0, width: 'auto', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                      />
                      {correcta && <span style={{ color: '#15803d', fontSize: '0.8rem', fontWeight: 700, flex: '0 0 auto' }}>✔ Correcta</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <button type="button" className="cu-btn cu-link" onClick={agregarPregunta} style={{ color: '#0f6cbf', cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left', fontSize: '0.9rem' }}><Plus size={14} /> Agregar pregunta manual</button>
      </div>

      <div className="cu-niveles-editor" style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div className="cu-niv-box" style={boxStyle}>
          <h5 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#1e3a8a' }}>📖 Nivel Literal (Abierta)</h5>
          <textarea
            value={pregLiteral.enunciado || ''}
            onChange={(e) => onChange({ preguntaLiteral: { ...pregLiteral, enunciado: e.target.value } })}
            placeholder="Escribe la pregunta abierta para el nivel literal..."
            style={areaStyle}
          />
        </div>
        <div className="cu-niv-box" style={boxStyle}>
          <h5 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#1e3a8a' }}>🔎 Nivel Inferencial (Abierta)</h5>
          <textarea
            value={pregInfer.enunciado || ''}
            onChange={(e) => onChange({ preguntaInferencial: { ...pregInfer, enunciado: e.target.value } })}
            placeholder="Escribe la pregunta inferencial..."
            style={{ ...areaStyle, marginBottom: '8px' }}
          />
          <textarea
            className="cu-ref"
            value={pregInfer.respuestaReferencia || ''}
            onChange={(e) => onChange({ preguntaInferencial: { ...pregInfer, respuestaReferencia: e.target.value } })}
            placeholder="Respuesta modelo para el docente..."
            style={{ ...areaStyle, background: '#fffbeb' }}
          />
        </div>
        <div className="cu-niv-box" style={boxStyle}>
          <h5 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#1e3a8a' }}>💡 Nivel Crítico (Abierta)</h5>
          <textarea
            value={pregCrit.enunciado || ''}
            onChange={(e) => onChange({ preguntaCritico: { ...pregCrit, enunciado: e.target.value } })}
            placeholder="Escribe la pregunta crítica..."
            style={{ ...areaStyle, marginBottom: '8px' }}
          />
          <textarea
            className="cu-ref"
            value={pregCrit.respuestaReferencia || ''}
            onChange={(e) => onChange({ preguntaCritico: { ...pregCrit, respuestaReferencia: e.target.value } })}
            placeholder="Respuesta modelo para el docente..."
            style={{ ...areaStyle, background: '#fffbeb' }}
          />
        </div>
      </div>
    </div>
  );
}

function Modal({ titulo, onClose, onSubmit, guardando, ancho, children }) {
  return (
    <div className="cu-overlay" onClick={onClose}>
      <form className={`cu-modal ${ancho ? 'cu-modal-wide' : ''}`} onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <div className="cu-modal-head">
          <h3>{titulo}</h3>
          <button type="button" className="cu-icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
        <div className="cu-modal-foot">
          <button type="button" className="cu-btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="cu-btn cu-btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  );
}

export default function CursoView({ cursoId, embebido = false }) {
  const { id: idRuta } = useParams();
  const id = cursoId || idRuta;
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [curso, setCurso] = useState(null);
  const [error, setError] = useState('');
  const [abiertas, setAbiertas] = useState({});
  const [rubricaAbierta, setRubricaAbierta] = useState({});
  const [lecturas, setLecturas] = useState([]);
  const [modal, setModal] = useState(null);
  const [versionesPlan, setVersionesPlan] = useState([]);
  const [versionActualPlan, setVersionActualPlan] = useState(1);
  const [cargandoVersiones, setCargandoVersiones] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [iaCargando, setIaCargando] = useState(false);

  const puedeEditar = !!curso?.puedeEditar;
  const edicion = puedeEditar;
  const pageStyle = embebido ? { minHeight: 0, height: 'auto', overflow: 'visible', background: 'transparent' } : undefined;

  useEffect(() => {
    (async () => {
      try {
        const c = await obtenerCurso(id);
        setCurso(c);
        setAbiertas(c.sesiones?.[0] ? { [c.sesiones[0]._id]: true } : {});
        if (c.puedeEditar) listarLecturas().then(setLecturas).catch(() => setLecturas([]));
      } catch (err) {
        setError(err.response?.data?.message || err.response?.data?.mensaje || 'No se pudo abrir el curso');
      }
    })();
  }, [id]);

  useEffect(() => {
    const recargarCurso = async () => {
      try {
        const c = await obtenerCurso(id);
        setCurso(c);
      } catch (e) {
        console.error('Error recargando curso:', e);
      }
    };

    socket.on('curso-actualizado', (data) => {
      if (data.cursoId === id) {
        console.log('🔄 Curso actualizado en tiempo real');
        recargarCurso();
      }
    });

    return () => {
      socket.off('curso-actualizado');
    };
  }, [id]);

  const aplicar = async (promesa) => {
    try { const c = await promesa; setCurso(c); return c; }
    catch (err) { alert(err.response?.data?.message || 'No se pudo completar la acción'); return false; }
  };

  const abrirHistorialPlan = async () => {
    setCargandoVersiones(true);
    try {
      const { data } = await api.get(`/cursos/${id}/historial-plan`);
      setVersionesPlan(data.versiones || []);
      setVersionActualPlan(data.versionActual || 1);
      setModal({ tipo: 'historial-plan' });
    } catch (err) {
      alert(err.response?.data?.message || 'No se pudo cargar el historial del plan');
    } finally { setCargandoVersiones(false); }
  };

  const restaurarPlan = async (version) => {
    if (!window.confirm(`¿Restaurar la planificación guardada en la versión ${version}? El estado actual también quedará en el historial.`)) return;
    setGuardando(true);
    try {
      const { data } = await api.post(`/cursos/${id}/historial-plan/${version}/restaurar`);
      setCurso(data.curso);
      setModal(null);
      await abrirHistorialPlan();
    } catch (err) {
      alert(err.response?.data?.message || 'No se pudo restaurar esa versión');
    } finally { setGuardando(false); }
  };

  const abrirSesion = (s) => setModal({ tipo: 'sesion', datos: s
    ? { _id: s._id, titulo: s.titulo, temas: s.temas, objetivoAprendizaje: s.objetivoAprendizaje || '', fechaProgramada: aInputFecha(s.fechaProgramada) }
    : { titulo: `Sesión ${(curso.sesiones?.length || 0) + 1}`, temas: '', objetivoAprendizaje: '', fechaProgramada: '' } });

  const guardarSesion = async (e) => {
    e.preventDefault();
    setGuardando(true);
    const { _id, titulo, temas, objetivoAprendizaje, fechaProgramada } = modal.datos;
    const cuerpo = { titulo, temas, objetivoAprendizaje, fechaProgramada: fechaProgramada ? new Date(fechaProgramada).toISOString() : null };
    const ok = await aplicar(_id ? actualizarSesion(id, _id, cuerpo) : crearSesion(id, cuerpo));
    setGuardando(false);
    if (ok) {
      if (!_id && ok.sesiones?.length) setAbiertas((a) => ({ ...a, [ok.sesiones[ok.sesiones.length - 1]._id]: true }));
      setModal(null);
    }
  };

  const borrarSesion = (s) => {
    if (window.confirm(`¿Eliminar "${s.titulo}" y todas sus actividades?`)) aplicar(eliminarSesion(id, s._id));
  };

  const abrirActividadBase = (sid, a) => setModal({ tipo: 'actividad', sid, datos: a
    ? { _id: a._id, modo: 'existente', archivo: null, lectura: a.lectura?._id || '', titulo: a.titulo || '', instrucciones: a.instrucciones || '', objetivoAprendizaje: a.objetivoAprendizaje || '', etapa: a.etapa || 'practica', tipoEvidencia: a.tipoEvidencia || 'respuestas', peso: a.peso ?? 100,
        fechaEntrega: aInputFecha(a.fechaEntrega), visible: a.visible !== false, rubrica: { criterios: a.rubrica?.criterios || [] },
        preguntasOpcionMultiple: a.lectura?.preguntasOpcionMultiple || [],
        preguntaLiteral: a.lectura?.preguntaLiteral || { enunciado: '' },
        preguntaInferencial: a.lectura?.preguntaInferencial || { enunciado: '', respuestaReferencia: '' },
        preguntaCritico: a.lectura?.preguntaCritico || { enunciado: '', respuestaReferencia: '' },
      }
    : { modo: 'subir', archivo: null, lectura: '', titulo: '', instrucciones: '', objetivoAprendizaje: '', etapa: 'practica', tipoEvidencia: 'respuestas', peso: 100, fechaEntrega: '', visible: true, rubrica: { criterios: [criterioNuevo()] },
        preguntasOpcionMultiple: [], preguntaLiteral: { enunciado: '' }, preguntaInferencial: { enunciado: '', respuestaReferencia: '' }, preguntaCritico: { enunciado: '', respuestaReferencia: '' } } });

  // Abre la actividad y, si ya tiene lectura, trae sus preguntas guardadas directamente de la biblioteca
  // (el curso no siempre las incluye al cargar las actividades).
  const abrirActividad = (sid, a) => {
    abrirActividadBase(sid, a);
    const lecturaId = a?.lectura?._id;
    if (!lecturaId) return;
    api.get('/biblioteca').then(({ data }) => {
      const l = (Array.isArray(data) ? data : []).find((x) => x._id === lecturaId);
      if (!l) return;
      setModal((m) => {
        if (!m || m.tipo !== 'actividad' || m.datos._id !== a._id) return m;
        const d = m.datos;
        return {
          ...m,
          datos: {
            ...d,
            preguntasOpcionMultiple: l.preguntasOpcionMultiple?.length ? l.preguntasOpcionMultiple : d.preguntasOpcionMultiple,
            preguntaLiteral: l.preguntaLiteral?.enunciado ? l.preguntaLiteral : d.preguntaLiteral,
            preguntaInferencial: l.preguntaInferencial?.enunciado ? l.preguntaInferencial : d.preguntaInferencial,
            preguntaCritico: l.preguntaCritico?.enunciado ? l.preguntaCritico : d.preguntaCritico,
          },
        };
      });
    }).catch((err) => console.error('No se pudieron cargar las preguntas de la lectura:', err));
  };

  const guardarActividad = async (e) => {
    e.preventDefault();
    const { _id, modo, archivo, ...d } = modal.datos;
    if (modo === 'subir' && !archivo) return alert('Selecciona el archivo PDF');
    if (modo !== 'subir' && !d.lectura) return alert('Elige la lectura de esta actividad');
    setGuardando(true);
    try {
      let lecturaId = d.lectura;
      if (modo === 'subir') {
        const resp = await subirLecturaPdf({ file: archivo, titulo: d.titulo });
        lecturaId = resp?.libro?._id;
        if (!lecturaId) throw new Error('El servidor no devolvió la lectura subida');
        listarLecturas().then(setLecturas).catch(() => {});
      }
      // Las preguntas viven en la lectura: se guardan ahí para que el alumno las vea en su pantalla.
      const hayPreguntas =
        (d.preguntasOpcionMultiple?.length || 0) > 0 ||
        d.preguntaLiteral?.enunciado || d.preguntaInferencial?.enunciado || d.preguntaCritico?.enunciado;
      if (hayPreguntas) {
        await api.put(`/biblioteca/${lecturaId}/preguntas`, {
          preguntasOpcionMultiple: d.preguntasOpcionMultiple || [],
          preguntaLiteral: d.preguntaLiteral,
          preguntaInferencial: d.preguntaInferencial,
          preguntaCritico: d.preguntaCritico,
        });
      }
      const cuerpo = { ...d, preguntas: d.preguntasOpcionMultiple, lectura: lecturaId, fechaEntrega: d.fechaEntrega ? new Date(d.fechaEntrega).toISOString() : '' };
      if (!curso?.puedeVerRubrica) delete cuerpo.rubrica;
      const ok = await aplicar(_id ? actualizarActividad(id, modal.sid, _id, cuerpo) : crearActividad(id, modal.sid, cuerpo));
      if (ok) setModal(null);
    } catch (err) {
      alert(err.response?.data?.mensaje || err.response?.data?.message || err.message || 'No se pudo guardar la actividad');
    } finally {
      setGuardando(false);
    }
  };

  const abrirRubrica = (sid, a) => setModal({
    tipo: 'rubrica', sid, aid: a._id,
    datos: { rubrica: { criterios: a.rubrica?.criterios?.length ? a.rubrica.criterios : [criterioNuevo()] } },
  });

  const guardarRubrica = async (e) => {
    e.preventDefault();
    setGuardando(true);
    const ok = await aplicar(actualizarActividad(id, modal.sid, modal.aid, { rubrica: modal.datos.rubrica }));
    setGuardando(false);
    if (ok) setModal(null);
  };

  const borrarActividad = (sid, a) => {
    if (window.confirm('¿Eliminar esta actividad?')) aplicar(eliminarActividad(id, sid, a._id));
  };

  const abrirReporteEvidencias = async () => {
    setModal({ tipo: 'evidencias', datos: { cargando: true, entregas: [], promediosPonderados: [] } });
    try {
      const { data } = await api.get(`/cursos/${id}/evidencias`);
      setModal((m) => m?.tipo === 'evidencias' ? { ...m, datos: { ...data, cargando: false } } : m);
    } catch (e) {
      setModal((m) => m?.tipo === 'evidencias' ? { ...m, datos: { cargando: false, error: e.response?.data?.message || 'No se pudo cargar el reporte.', entregas: [], promediosPonderados: [] } } : m);
    }
  };

  const descargarEvidenciasCsv = () => {
    const filas = [['Alumno', 'Correo', 'Tipo de registro', 'Actividad', 'Intento', 'Puntaje', 'Estado', 'Peso', 'Versión del plan', 'Fecha', 'Respuesta', 'Retroalimentación', 'Nivel literal', 'Nivel inferencial', 'Nivel crítico']];
    (modal?.datos?.entregas || []).forEach((e) => filas.push([
      [e.alumno?.nombre, e.alumno?.apellido].filter(Boolean).join(' '), e.alumno?.email || '', 'Evidencia', e.actividad?.titulo || '', e.intento,
      e.puntaje ?? '', e.estado, e.actividad?.peso ?? 0, e.planVersion,
      new Date(e.createdAt).toLocaleString('es-PE'), e.respuesta || '', e.retroalimentacion || '', '', '', '',
    ]));
    (modal?.datos?.promediosPonderados || []).forEach((p) => filas.push([
      [p.alumno?.nombre, p.alumno?.apellido].filter(Boolean).join(' '), p.alumno?.email || '', 'Resumen ponderado del curso', '', p.nota ?? '', p.nota == null ? 'Pendiente' : 'Calculada', p.pesoEvaluado, curso.planVersion,
      '', `Productos: ${p.promedioProductos ?? '—'}/100; comprensión lectora: ${p.promedioComprension ?? '—'}/100`,
      (p.desempeno || []).map((d) => `${d.actividad}: evidencia ${d.evidencia ?? 'pendiente'}, comprensión ${d.interaccion ?? '—'}, ponderado ${d.combinado}`).join(' | '),
      p.niveles?.literal ?? '', p.niveles?.inferencial ?? '', p.niveles?.critico ?? '',
    ]));
    const csv = filas.map((fila) => fila.map((celda) => `"${String(celda ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
    const enlace = document.createElement('a'); enlace.href = url; enlace.download = `entregas-${curso.nombre.replace(/[^a-z0-9-_]/gi, '-')}.csv`; enlace.click(); URL.revokeObjectURL(url);
  };

  const guardarCalificacionEvidencia = async (e, entrega) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api.patch(`/cursos/${id}/evidencias/${entrega._id}`, {
        puntaje: f.get('puntaje'), retroalimentacion: f.get('retroalimentacion'), motivo: f.get('motivo'),
      });
      await abrirReporteEvidencias();
    } catch (error) { alert(error.response?.data?.message || 'No se pudo guardar la nota'); }
  };

  const restaurarNotaEvidencia = async (entrega, revisionId) => {
    if (!window.confirm('¿Restaurar la nota anterior? Esta acción también quedará registrada.')) return;
    try {
      await api.post(`/cursos/${id}/evidencias/${entrega._id}/restaurar/${revisionId}`);
      await abrirReporteEvidencias();
    } catch (error) { alert(error.response?.data?.message || 'No se pudo restaurar la nota'); }
  };

  if (error) return <div className="cu-page cu-course-page" style={pageStyle}><p className="cu-error cu-center">{error}</p>{!embebido && <button className="cu-link cu-center" onClick={() => navigate('/cursos')}>Volver a mis cursos</button>}</div>;
  if (!curso) return <div className="cu-page cu-course-page" style={pageStyle}><p className="cu-muted cu-center">Cargando curso…</p></div>;

  const sesiones = curso.sesiones || [];
  const primeraActividad = sesiones.flatMap((s) => s.actividades || []).find((a) => a.lectura?._id && a.visible !== false);
  const primeraLectura = primeraActividad?.lectura?._id;
  const rutaLectura = (lecturaId, tab, actividadId) =>
    `/student/reading?${lecturaId ? `id=${lecturaId}&` : ''}curso=${id}${actividadId ? `&actividad=${actividadId}` : ''}${tab ? `&tab=${tab}` : ''}`;
  const actividadesEnRuta = sesiones.flatMap((s) => (s.actividades || []).filter((a) => a.visible !== false && a.lectura?._id));
  const siguientePaso = actividadesEnRuta.find((a) => ['actual', 'refuerzo'].includes(a.rutaAprendizaje?.estado));
  const rutaCompleta = actividadesEnRuta.length > 0 && actividadesEnRuta.every((a) => a.rutaAprendizaje?.estado === 'dominada');
  const setDatos = (patch) => setModal((m) => ({ ...m, datos: { ...m.datos, ...patch } }));

  return (
    <div className="cu-page cu-course-page" style={pageStyle}>
      {!embebido && (
      <header className="cu-topbar">
        <button className="cu-link" onClick={() => navigate('/cursos')}><ArrowLeft size={16} /> Mis cursos</button>
        <h1 className="cu-brand">{curso.nombre}</h1>
        <div className="cu-topright">
          {!puedeEditar && (
            <button className="cu-btn cu-btn-primary" onClick={() => navigate(rutaLectura(primeraLectura, 'Asistente', primeraActividad?._id))}>
              <MessageCircle size={15} /> Asistente
            </button>
          )}
          <span className="cu-user">{user?.nombre}</span>
        </div>
      </header>
      )}

      <main className="cu-content">
        <h2 className="cu-section-title">Contenido del Curso{embebido ? ` · ${curso.nombre} ${curso.grado} «${curso.seccion}»` : ''}</h2>
        {edicion && (
          <div className="cu-center" style={{ marginBottom: 18 }}>
            <button className="cu-btn cu-btn-primary" onClick={() => abrirSesion()}><Plus size={15} /> Crear sesión</button>
            <button className="cu-btn" onClick={abrirReporteEvidencias} style={{ marginLeft: 8 }}>Entregas y notas ponderadas</button>
            <button className="cu-btn" onClick={abrirHistorialPlan} disabled={cargandoVersiones} style={{ marginLeft: 8 }}>
              {cargandoVersiones ? 'Cargando historial…' : 'Historial y restauración del plan'}
            </button>
          </div>
        )}
        {curso.descripcion && <p className="cu-muted cu-center">{curso.descripcion}</p>}
        {!puedeEditar && siguientePaso && <p role="status" className="cu-activity" style={{ justifyContent: 'center', textAlign: 'center' }}>
          {siguientePaso.rutaAprendizaje.estado === 'refuerzo'
            ? `Paso ${siguientePaso.rutaAprendizaje.indice}: repasa la retroalimentación y reintenta para avanzar.`
            : `Siguiente paso: ${siguientePaso.rutaAprendizaje.indice} de ${siguientePaso.rutaAprendizaje.total}.`}
        </p>}
        {!puedeEditar && rutaCompleta && <p role="status" className="cu-activity" style={{ justifyContent: 'center', textAlign: 'center' }}>¡Ruta completada! Has demostrado el dominio esperado en todas las actividades visibles.</p>}
        {(curso.institucion || curso.areaCurricular || curso.referenciaCurricular || curso.competencias?.length || curso.programacionCurricular) && (
          <aside className="cu-activity" style={{ marginBottom: 18 }}>
            <div className="cu-act-main"><h4>Contexto curricular del curso</h4>
              {[curso.institucion, curso.areaCurricular, curso.referenciaCurricular].filter(Boolean).join(' · ') && <p>{[curso.institucion, curso.areaCurricular, curso.referenciaCurricular].filter(Boolean).join(' · ')}</p>}
              {!!curso.competencias?.length && <p><strong>Competencias:</strong> {curso.competencias.join(' · ')}</p>}
              {curso.programacionCurricular && <details><summary>Ver extracto de la programación</summary><p style={{ whiteSpace: 'pre-wrap' }}>{curso.programacionCurricular}</p></details>}
            </div>
          </aside>
        )}

        {!puedeEditar && (
          <div className="cu-activity" style={{ marginBottom: 16 }}>
            <MessageCircle size={22} className="cu-act-ico" />
            <div className="cu-act-main">
              <h4>Asistente virtual de lectura</h4>
              <p>¿Dudas con un texto? Pregúntale a tu asistente: te da pistas para que descubras la respuesta.</p>
              <div className="cu-act-buttons">
                <button className="cu-btn cu-btn-primary" onClick={() => navigate(rutaLectura(primeraLectura, 'Asistente', primeraActividad?._id))}>
                  <MessageCircle size={15} /> Abrir asistente
                </button>
              </div>
            </div>
          </div>
        )}

        {sesiones.length === 0 && (
          <p className="cu-empty">{puedeEditar ? 'Este curso todavía no tiene sesiones. Usa «Crear sesión» para agregar la primera y subir su contenido.' : 'Tu docente aún no publicó sesiones.'}</p>
        )}

        <div className="cu-folders">
          {sesiones.map((s) => {
            const abierta = !!abiertas[s._id];
            return (
              <section key={s._id} className={`cu-folder ${abierta ? 'open' : ''} ${s.visible === false ? 'hidden-item' : ''}`}>
                <div className="cu-folder-head" onClick={() => setAbiertas({ ...abiertas, [s._id]: !abierta })}>
                  {abierta ? <FolderOpen size={22} className="cu-folder-ico" /> : <Folder size={22} className="cu-folder-ico" />}
                  <h3>{s.titulo}</h3>
                  {s.fechaProgramada && <p className="cu-meta">Programada: {formatearFecha(s.fechaProgramada)}</p>}
                  {s.visible === false && <span className="cu-badge">Oculta</span>}
                  {edicion && (
                    <span className="cu-edit-tools" onClick={(e) => e.stopPropagation()}>
                      <button className="cu-icon-btn" title={s.visible === false ? 'Mostrar a los alumnos' : 'Ocultar a los alumnos'}
                        onClick={() => aplicar(actualizarSesion(id, s._id, { visible: s.visible === false }))}>
                        {s.visible === false ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                      <button className="cu-icon-btn" title="Editar sesión" onClick={() => abrirSesion(s)}><Pencil size={16} /></button>
                      <button className="cu-icon-btn cu-danger" title="Eliminar sesión" onClick={() => borrarSesion(s)}><Trash2 size={16} /></button>
                    </span>
                  )}
                  {abierta ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>

                {abierta && (
                  <div className="cu-folder-body">
                    {s.temas && <p className="cu-temas"><strong>Tema:</strong> {s.temas}</p>}
                    {s.objetivoAprendizaje && <p className="cu-meta"><strong>Objetivo de aprendizaje:</strong> {s.objetivoAprendizaje}</p>}

                    {(s.actividades || []).length === 0 && <p className="cu-muted">Esta sesión no tiene actividades todavía.</p>}

                    {(s.actividades || []).map((a) => {
                      const titulo = a.titulo || a.lectura?.titulo || 'Actividad';
                      const verRubrica = !!rubricaAbierta[a._id];
                      const tieneRubrica = (a.rubrica?.criterios || []).length > 0;
                      const ruta = a.rutaAprendizaje;
                      const etiquetaRuta = { actual: 'Siguiente paso', refuerzo: 'Necesita refuerzo', dominada: 'Dominada', bloqueada: 'Bloqueada' }[ruta?.estado];
                      return (
                        <article key={a._id} className={`cu-activity ${a.visible === false ? 'hidden-item' : ''}`}>
                          <FileText size={22} className="cu-act-ico" />
                          <div className="cu-act-main">
                            <h4>{titulo} {a.visible === false && <span className="cu-badge">Oculta</span>} {etiquetaRuta && !puedeEditar && <span className="cu-badge">{etiquetaRuta}{ruta.puntaje != null ? ` · ${ruta.puntaje}/100` : ''}</span>}</h4>
                            {a.instrucciones && <p>{a.instrucciones}</p>}
                            {a.objetivoAprendizaje && <p className="cu-meta"><strong>Objetivo:</strong> {a.objetivoAprendizaje}</p>}
                            <p className="cu-meta">Etapa: {({ introduccion: 'Introducción', explicacion: 'Explicación', practica: 'Práctica guiada', comprobacion: 'Comprobación' })[a.etapa] || 'Práctica guiada'} · Evidencia: {({ respuestas: 'Preguntas de comprensión', palabras_clave: 'Palabras clave', resumen: 'Resumen', respuesta_abierta: 'Respuesta argumentada' })[a.tipoEvidencia] || 'Preguntas de comprensión'} · Peso: {a.peso ?? 100}%</p>
                            {a.fechaEntrega && <p className="cu-meta">Fecha de entrega: {formatearFecha(a.fechaEntrega)}</p>}
                            <div className="cu-act-buttons">
                              {!puedeEditar && ruta?.bloqueada && <p role="status" className="cu-muted">Completa el paso {ruta.indice - 1} con al menos 70/100 para continuar la ruta.</p>}
                              {!puedeEditar && a.lectura?._id && (
                                <>
                                  <button className="cu-btn cu-btn-primary" disabled={ruta?.bloqueada} onClick={() => navigate(rutaLectura(a.lectura._id, 'Lectura', a._id))}>
                                    <PlayCircle size={15} /> Comenzar actividad
                                  </button>
                                  <button className="cu-btn" disabled={ruta?.bloqueada} onClick={() => navigate(rutaLectura(a.lectura._id, 'Asistente', a._id))}>
                                    <MessageCircle size={15} /> Preguntar al asistente
                                  </button>
                                </>
                              )}
                              {a.lectura?.pdfUrl && (
                                <a className="cu-btn" style={{ textDecoration: 'none' }} href={`${API_BASE_URL}${a.lectura.pdfUrl}`} target="_blank" rel="noreferrer">
                                  <ExternalLink size={15} /> Abrir material
                                </a>
                              )}
                              {puedeEditar && curso.puedeVerRubrica && tieneRubrica && (
                                <button className="cu-btn" onClick={() => setRubricaAbierta({ ...rubricaAbierta, [a._id]: !verRubrica })}>
                                  <ClipboardList size={15} /> {verRubrica ? 'Ocultar rúbrica' : 'Ver rúbrica'}
                                </button>
                              )}
                            {edicion && curso.puedeVerRubrica && (
                                <button className="cu-btn" onClick={() => abrirRubrica(s._id, a)}>
                                  <Plus size={15} /> {tieneRubrica ? 'Editar rúbrica' : 'Crear rúbrica'}
                                </button>
                              )}
                            </div>
                            {puedeEditar && curso.puedeVerRubrica && verRubrica && tieneRubrica && <RubricaTabla rubrica={a.rubrica} />}
                          </div>
                          {edicion && (
                            <span className="cu-edit-tools">
                              <button className="cu-icon-btn" title={a.visible === false ? 'Mostrar' : 'Ocultar'}
                                onClick={() => aplicar(actualizarActividad(id, s._id, a._id, { visible: a.visible === false }))}>
                                {a.visible === false ? <EyeOff size={16} /> : <Eye size={16} />}
                              </button>
                              <button className="cu-icon-btn" title="Editar" onClick={() => abrirActividad(s._id, a)}><Pencil size={16} /></button>
                              <button className="cu-icon-btn cu-danger" title="Eliminar" onClick={() => borrarActividad(s._id, a)}><Trash2 size={16} /></button>
                            </span>
                          )}
                        </article>
                      );
                    })}

                    {edicion && (
                      <button className="cu-btn cu-add" onClick={() => abrirActividad(s._id)}><Plus size={15} /> Agregar actividad</button>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </main>

      {modal?.tipo === 'sesion' && (
        <Modal titulo={modal.datos._id ? 'Editar sesión' : 'Nueva sesión'} onClose={() => setModal(null)} onSubmit={guardarSesion} guardando={guardando}>
          <label>Título
            <input required value={modal.datos.titulo} onChange={(e) => setDatos({ titulo: e.target.value })} />
          </label>
          <label>Fecha y hora programadas
            <input type="datetime-local" value={modal.datos.fechaProgramada || ''} onChange={(e) => setDatos({ fechaProgramada: e.target.value })} />
          </label>
          <label>Temas de la sesión
            <textarea rows={4} value={modal.datos.temas} onChange={(e) => setDatos({ temas: e.target.value })}
              placeholder="1. Recolección de datos  2. Análisis de datos ..." />
          </label>
          <label>Objetivo de aprendizaje de la sesión
            <textarea rows={2} value={modal.datos.objetivoAprendizaje} onChange={(e) => setDatos({ objetivoAprendizaje: e.target.value })} placeholder="¿Qué podrá comprender o demostrar el estudiante al terminar la sesión?" />
          </label>
        </Modal>
      )}

      {modal?.tipo === 'historial-plan' && (
        <div className="cu-overlay" onClick={() => setModal(null)}>
          <section className="cu-modal cu-modal-wide" role="dialog" aria-modal="true" aria-label="Historial del plan" onClick={(e) => e.stopPropagation()}>
            <div className="cu-modal-head"><h3>Historial de la planificación</h3><button type="button" className="cu-icon-btn" onClick={() => setModal(null)}><X size={18} /></button></div>
            <p className="cu-muted">Cada edición de sesiones, recursos o rúbricas guarda el estado anterior. Al restaurar, el estado actual también se conserva.</p>
            <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
              {!versionesPlan.length ? <p className="cu-empty">Aún no hay versiones anteriores registradas. Se guardarán a partir del próximo cambio.</p> : versionesPlan.map((version) => (
                <article key={version._id} className="cu-activity" style={{ margin: '10px 0' }}>
                  <div className="cu-act-main">
                    <h4>Versión {version.version}</h4>
                    <p>{version.snapshot?.nombre} · {version.snapshot?.grado} «{version.snapshot?.seccion}» · {version.snapshot?.sesiones?.length || 0} sesiones</p>
                    <p className="cu-meta">{version.action} · {[version.actorId?.nombre, version.actorId?.apellido].filter(Boolean).join(' ') || version.actorId?.email || 'Docente'} · {new Date(version.createdAt).toLocaleString('es-PE')}</p>
                  </div>
                  <button className="cu-btn" disabled={guardando || version.version === versionActualPlan} onClick={() => restaurarPlan(version.version)}>
                    {version.version === versionActualPlan ? 'Versión actual' : 'Restaurar'}
                  </button>
                </article>
              ))}
            </div>
            <div className="cu-modal-foot"><button type="button" className="cu-btn" onClick={() => setModal(null)}>Cerrar</button></div>
          </section>
        </div>
      )}

      {modal?.tipo === 'rubrica' && (
        <Modal ancho titulo="Rúbrica de la actividad" onClose={() => setModal(null)} onSubmit={guardarRubrica} guardando={guardando}>
          <p className="cu-muted">Define los criterios y sus niveles de logro. Esta rúbrica solo es visible para el docente.</p>
          <RubricaEditor value={modal.datos.rubrica} onChange={(rubrica) => setDatos({ rubrica })} />
        </Modal>
      )}

      {modal?.tipo === 'evidencias' && (
        <div className="cu-overlay" onClick={() => setModal(null)}>
          <section className="cu-modal cu-modal-wide" role="dialog" aria-modal="true" aria-label="Entregas de evidencias" onClick={(e) => e.stopPropagation()}>
            <div className="cu-modal-head"><div><h3>Entregas y notas ponderadas</h3><p className="cu-muted">Curso {curso.nombre} · versión actual del plan {modal.datos.curso?.planVersion || curso.planVersion}</p></div><button type="button" className="cu-icon-btn" onClick={() => setModal(null)}><X size={18} /></button></div>
            {modal.datos.cargando ? <p className="cu-muted">Cargando entregas…</p> : modal.datos.error ? <p className="cu-error">{modal.datos.error}</p> : <>
              <button type="button" className="cu-btn" onClick={descargarEvidenciasCsv} disabled={!modal.datos.entregas?.length && !modal.datos.promediosPonderados?.length}>Descargar notas y entregas CSV</button>
              <h4>Promedio ponderado por alumno</h4>
              <p className="cu-muted">La nota ponderada combina, por actividad, el producto escrito y el indicador de comprensión disponible. Si solo uno está evaluado, usa ese resultado. Los pesos definidos en la planificación determinan la nota del curso; los niveles literal, inferencial y crítico se muestran por separado.</p>
              {!modal.datos.promediosPonderados?.length ? <p className="cu-muted">Aún no hay entregas ni evaluaciones de lectura en este curso.</p> : <div style={{ overflowX: 'auto' }}><table className="cu-table"><thead><tr><th>Alumno</th><th>Nota ponderada</th><th>Productos</th><th>Comprensión</th><th>Niveles</th><th>Peso evaluado</th><th>Detalle</th></tr></thead><tbody>
                {modal.datos.promediosPonderados.map((p, i) => <tr key={p.alumno?._id || i}><td>{[p.alumno?.nombre, p.alumno?.apellido].filter(Boolean).join(' ') || p.alumno?.email || 'Alumno'}</td><td>{p.nota == null ? 'Pendiente' : `${p.nota}/100`}</td><td>{p.promedioProductos == null ? '—' : `${p.promedioProductos}/100`}</td><td>{p.promedioComprension == null ? '—' : `${p.promedioComprension}/100`}</td><td>L {p.niveles?.literal ?? '—'} · I {p.niveles?.inferencial ?? '—'} · C {p.niveles?.critico ?? '—'}</td><td>{p.pesoEvaluado}%</td><td><details><summary>Ver actividades</summary>{(p.desempeno || []).map((d, j) => <p key={`${d.actividad}-${j}`}>{d.actividad} · peso {d.peso}% · evidencia {d.evidencia == null ? 'pendiente' : d.evidencia} · comprensión {d.interaccion == null ? 'sin evaluación' : d.interaccion} · combinado {d.combinado}</p>)}</details></td></tr>)}
              </tbody></table></div>}
              <h4 style={{ marginTop: 22 }}>Historial de entregas</h4>
              {!modal.datos.entregas?.length ? <p className="cu-muted">No hay evidencias entregadas.</p> : <div style={{ maxHeight: '45vh', overflow: 'auto' }}>{modal.datos.entregas.map((e) => <article key={e._id} className="cu-activity" style={{ margin: '8px 0' }}>
                <div className="cu-act-main"><h4>{e.actividad?.titulo || 'Actividad'} · Intento {e.intento}</h4><p>{[e.alumno?.nombre, e.alumno?.apellido].filter(Boolean).join(' ') || e.alumno?.email} · Plan v{e.planVersion} · {new Date(e.createdAt).toLocaleString('es-PE')}</p><p><strong>Nota:</strong> {e.puntaje == null ? 'Pendiente' : `${e.puntaje}/100`} · {e.estado}</p><details><summary>Ver respuesta, retroalimentación y revisar nota</summary><p style={{ whiteSpace: 'pre-wrap' }}>{e.respuesta}</p><p>{e.retroalimentacion}</p>
                  <form onSubmit={(event) => guardarCalificacionEvidencia(event, e)} style={{ display: 'grid', gap: 8, maxWidth: 560, marginTop: 12 }}>
                    <label>Nota de 0 a 100 <input name="puntaje" type="number" min="0" max="100" step="0.01" required defaultValue={e.puntaje ?? ''} /></label>
                    <label>Retroalimentación para el alumno <textarea name="retroalimentacion" rows={3} defaultValue={e.retroalimentacion || ''} /></label>
                    <label>Motivo de la revisión (queda en el historial) <input name="motivo" required placeholder="Revisión de evidencia, corrección…" /></label>
                    <button className="cu-btn cu-btn-primary" type="submit">Guardar nota revisada</button>
                  </form>
                  {!!e.revisionesNota?.length && <div style={{ marginTop: 12 }}><strong>Historial de notas</strong>{e.revisionesNota.slice().reverse().map((r) => <p key={r._id}>{r.antes ?? 'Pendiente'} → {r.despues} · {[r.actorId?.nombre, r.actorId?.apellido].filter(Boolean).join(' ') || r.actorId?.email || 'Docente'} · {new Date(r.createdAt).toLocaleString('es-PE')} · {r.motivo} <button type="button" className="cu-btn" onClick={() => restaurarNotaEvidencia(e, r._id)}>Restaurar anterior</button></p>)}</div>}
                </details></div>
              </article>)}</div>}
            </>}
            <div className="cu-modal-foot"><button type="button" className="cu-btn" onClick={() => setModal(null)}>Cerrar</button></div>
          </section>
        </div>
      )}

      {modal?.tipo === 'actividad' && (
        <Modal ancho titulo={modal.datos._id ? 'Editar actividad' : 'Nueva actividad'} onClose={() => setModal(null)} onSubmit={guardarActividad} guardando={guardando}>
          <label>Material de la actividad
            <select value={modal.datos.modo} onChange={(e) => setDatos({ modo: e.target.value })}>
              <option value="subir">Subir un archivo PDF nuevo</option>
              <option value="existente">Usar una lectura que ya subí</option>
            </select>
          </label>
          {modal.datos.modo === 'subir' ? (
            <label>Archivo PDF
              <input type="file" accept="application/pdf" required onChange={(e) => setDatos({ archivo: e.target.files[0] || null, lectura: '' })} />
            </label>
          ) : (
            <>
              <label>Lectura
                <select required value={modal.datos.lectura} onChange={(e) => setDatos({ lectura: e.target.value })}>
                  <option value="">— Elige una lectura de tu biblioteca —</option>
                  {lecturas.map((l) => <option key={l._id} value={l._id}>{l.titulo}</option>)}
                </select>
              </label>
              {lecturas.length === 0 && <p className="cu-muted">Aún no tienes lecturas subidas: elige «Subir un archivo PDF nuevo».</p>}
            </>
          )}
          <label>Título de la actividad (opcional; por defecto el nombre del archivo o de la lectura)
            <input value={modal.datos.titulo} onChange={(e) => setDatos({ titulo: e.target.value })} />
          </label>
          <label>Instrucciones
            <textarea rows={3} value={modal.datos.instrucciones} onChange={(e) => setDatos({ instrucciones: e.target.value })} />
          </label>
          <label>Objetivo de aprendizaje
            <input value={modal.datos.objetivoAprendizaje} onChange={(e) => setDatos({ objetivoAprendizaje: e.target.value })} placeholder="Ej.: identificar la idea principal y justificarla con el texto" />
          </label>
          <div className="cu-row">
            <label>Etapa de la sesión
              <select value={modal.datos.etapa} onChange={(e) => setDatos({ etapa: e.target.value })}>
                <option value="introduccion">Introducción</option><option value="explicacion">Explicación</option><option value="practica">Práctica guiada</option><option value="comprobacion">Comprobación</option>
              </select>
            </label>
            <label>Producto o evidencia
              <select value={modal.datos.tipoEvidencia} onChange={(e) => setDatos({ tipoEvidencia: e.target.value })}>
                <option value="respuestas">Preguntas de comprensión</option><option value="palabras_clave">Palabras clave</option><option value="resumen">Resumen</option><option value="respuesta_abierta">Respuesta argumentada</option>
              </select>
            </label>
          </div>
          <label>Peso en la nota del curso (0 a 100)
            <input type="number" min="0" max="100" value={modal.datos.peso} onChange={(e) => setDatos({ peso: e.target.value })} />
          </label>
          <div className="cu-row">
            <label>Fecha de entrega
              <input type="datetime-local" value={modal.datos.fechaEntrega} onChange={(e) => setDatos({ fechaEntrega: e.target.value })} />
            </label>
            <label className="cu-check">
              <input type="checkbox" checked={modal.datos.visible} onChange={(e) => setDatos({ visible: e.target.checked })} /> Visible para los alumnos
            </label>
          </div>
          {curso.puedeVerRubrica && <><h4 className="cu-sub">Rúbrica privada del docente</h4>
          <RubricaEditor value={modal.datos.rubrica} onChange={(rubrica) => setDatos({ rubrica })} /></>}
          <h4 className="cu-sub">Preguntas de Comprensión</h4>
          <PreguntasEditor
            value={modal.datos}
            onChange={(preg) => setDatos(preg)}
            lecturaId={modal.datos.lectura}
            modo={modal.datos.modo}
            archivo={modal.datos.archivo}
            tituloActividad={modal.datos.titulo}
            onLecturaSubida={(lid) => {
              setDatos({ modo: 'existente', lectura: lid, archivo: null });
              listarLecturas().then(setLecturas).catch(() => {});
            }}
            generando={iaCargando}
            onGenerating={setIaCargando}
          />
        </Modal>
      )}
    </div>
  );
}

