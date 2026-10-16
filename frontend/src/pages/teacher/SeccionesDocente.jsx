import React, { useEffect, useState } from 'react';
import {
  BookOpen, Wand2, Save, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, Loader2, Pencil, X, Plus, Trash2,
} from 'lucide-react';
import {
  obtenerLibros,
  
  guardarPreguntas,
} from '../../services/bibliotecaService';
import './SeccionesDocente.css';

/* ── helpers ──────────────────────────────────────────────── */
const opcionesBase = () => [
  { id: 'A', texto: '' },
  { id: 'B', texto: '' },
  { id: 'C', texto: '' },
  { id: 'D', texto: '' },
];

const preguntaVacia = (id) => ({
  id,
  enunciado: '',
  opciones: opcionesBase(),
  respuestaCorrecta: 'A',
});

/* ══════════════════════════════════════════════════════════
   EDITOR DE UNA SOLA PREGUNTA OPCIÓN MÚLTIPLE
══════════════════════════════════════════════════════════ */
function EditorPregunta({ pregunta, onChange, onEliminar, index }) {
  const actualizar = (campo, valor) => onChange({ ...pregunta, [campo]: valor });
  const actualizarOpcion = (optId, texto) =>
    onChange({
      ...pregunta,
      opciones: pregunta.opciones.map((o) => (o.id === optId ? { ...o, texto } : o)),
    });

  return (
    <div className="sd-pregunta-card">
      <div className="sd-pregunta-header">
        <span className="sd-pregunta-num">Pregunta {index + 1}</span>
        <button className="sd-btn-icon danger" onClick={onEliminar} title="Eliminar pregunta">
          <Trash2 size={15} />
        </button>
      </div>

      <label className="sd-label">Enunciado
        <textarea
          className="sd-textarea"
          rows={2}
          value={pregunta.enunciado}
          onChange={(e) => actualizar('enunciado', e.target.value)}
          placeholder="Escribe el enunciado de la pregunta..."
        />
      </label>

      <div className="sd-opciones-grid">
        {pregunta.opciones.map((op) => (
          <label key={op.id} className={`sd-opcion ${pregunta.respuestaCorrecta === op.id ? 'correcta' : ''}`}>
            <span className="sd-opcion-letra">{op.id}</span>
            <input
              type="text"
              value={op.texto}
              onChange={(e) => actualizarOpcion(op.id, e.target.value)}
              placeholder={`Opción ${op.id}`}
            />
            <input
              type="radio"
              name={`resp-${pregunta.id}`}
              checked={pregunta.respuestaCorrecta === op.id}
              onChange={() => actualizar('respuestaCorrecta', op.id)}
              title="Marcar como correcta"
            />
          </label>
        ))}
      </div>
      <p className="sd-hint">Selecciona el radio ○ de la opción correcta.</p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   EDITOR DE PREGUNTAS ABIERTAS (literal / inferencial / crítico)
══════════════════════════════════════════════════════════ */
function EditorAbierta({ titulo, nivel, valor, onChange }) {
  return (
    <div className="sd-abierta-card">
      <div className="sd-abierta-header">
        <span className={`sd-badge sd-badge-${nivel}`}>{titulo}</span>
      </div>
      <label className="sd-label">Enunciado de la pregunta
        <textarea
          className="sd-textarea"
          rows={2}
          value={valor.enunciado || ''}
          onChange={(e) => onChange({ ...valor, enunciado: e.target.value })}
          placeholder="Pregunta que verá el alumno..."
        />
      </label>
      {nivel !== 'literal' && (
        <label className="sd-label">Respuesta modelo (referencia para la IA de evaluación)
          <textarea
            className="sd-textarea sd-textarea-ref"
            rows={3}
            value={valor.respuestaReferencia || ''}
            onChange={(e) => onChange({ ...valor, respuestaReferencia: e.target.value })}
            placeholder="Respuesta ideal completa que usará la IA para comparar con las del alumno..."
          />
        </label>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   PANEL COMPLETO DE UNA LECTURA
══════════════════════════════════════════════════════════ */
function PanelLectura({ lectura }) {
  const [expandido, setExpandido] = useState(false);
  
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null); // { tipo: 'ok'|'error', texto }

  // Estado local editable
  const [pom, setPom] = useState(lectura.preguntasOpcionMultiple || []);
  const [literal, setLiteral] = useState(lectura.preguntaLiteral || {});
  const [inferencial, setInferencial] = useState(lectura.preguntaInferencial || {});
  const [critico, setCritico] = useState(lectura.preguntaCritico || {});

  const tienePreguntas = pom.length > 0 || literal?.enunciado || inferencial?.enunciado || critico?.enunciado;

  /* Genera preguntas con IA */
  const handleGenerar = async () => {
    setGenerando(true);
    setAviso(null);
    try {
      const data = await generarPreguntasIA(lectura._id);
      const p = data.preguntas;
      setPom(p.preguntasOpcionMultiple || []);
      setLiteral(p.preguntaLiteral || {});
      setInferencial(p.preguntaInferencial || {});
      setCritico(p.preguntaCritico || {});
      setExpandido(true);
      setAviso({ tipo: 'ok', texto: '✓ Preguntas generadas. Revísalas y edítalas antes de guardar.' });
    } catch (err) {
      const msg = err.response?.data?.mensaje || 'Error al generar preguntas con la IA.';
      setAviso({ tipo: 'error', texto: msg });
    } finally {
      setGenerando(false);
    }
  };

  /* Agrega pregunta vacía */
  const agregarPregunta = () => {
    const nuevoId = pom.length > 0 ? Math.max(...pom.map((p) => p.id)) + 1 : 1;
    setPom([...pom, preguntaVacia(nuevoId)]);
  };

  /* Actualiza una pregunta opción múltiple */
  const actualizarPregunta = (idx, nueva) => {
    setPom(pom.map((p, i) => (i === idx ? nueva : p)));
  };

  /* Elimina una pregunta */
  const eliminarPregunta = (idx) => {
    setPom(pom.filter((_, i) => i !== idx));
  };

  /* Guarda las preguntas en el backend */
  const handleGuardar = async () => {
    setGuardando(true);
    setAviso(null);
    try {
      await guardarPreguntas(lectura._id, {
        preguntasOpcionMultiple: pom,
        preguntaLiteral: literal,
        preguntaInferencial: inferencial,
        preguntaCritico: critico,
      });
      setAviso({ tipo: 'ok', texto: '✓ Preguntas guardadas correctamente.' });
    } catch (err) {
      const msg = err.response?.data?.mensaje || 'No se pudo guardar.';
      setAviso({ tipo: 'error', texto: msg });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="sd-panel">
      {/* Cabecera del panel */}
      <div className="sd-panel-header" onClick={() => setExpandido(!expandido)}>
        <div className="sd-panel-info">
          <BookOpen size={17} className="sd-panel-icon" />
          <div>
            <span className="sd-panel-titulo">{lectura.titulo}</span>
            <span className="sd-panel-meta">
              {lectura.autor && `${lectura.autor} · `}
              {lectura.categoria || 'General'}
              {tienePreguntas && (
                <span className="sd-badge-pregs"> · {pom.length} preg. opción múltiple</span>
              )}
            </span>
          </div>
        </div>
        <div className="sd-panel-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="sd-btn-ia"
            onClick={handleGenerar}
            disabled={generando}
            title="Generar preguntas con IA"
          >
            {generando ? <Loader2 size={15} className="sd-spin" /> : <Wand2 size={15} />}
            {generando ? 'Generando...' : tienePreguntas ? 'Regenerar con IA' : 'Generar con IA'}
          </button>
          <button className="sd-btn-icon" onClick={() => setExpandido(!expandido)} title="Expandir / colapsar">
            {expandido ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      {/* Aviso */}
      {aviso && (
        <div className={`sd-aviso sd-aviso-${aviso.tipo}`}>
          {aviso.tipo === 'ok' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          <span>{aviso.texto}</span>
          <button className="sd-btn-icon" onClick={() => setAviso(null)}><X size={14} /></button>
        </div>
      )}

      {/* Contenido editable */}
      {expandido && (
        <div className="sd-panel-body">
          {!tienePreguntas && !generando && (
            <div className="sd-empty">
              <Wand2 size={22} />
              <p>Esta lectura aún no tiene preguntas.<br/>Usa los botones para agregar preguntas manualmente.</p>
            </div>
          )}

          {/* ── Preguntas opción múltiple ── */}
          {pom.length > 0 && (
            <section>
              <h3 className="sd-section-title">Preguntas de opción múltiple</h3>
              {pom.map((preg, idx) => (
                <EditorPregunta
                  key={preg.id}
                  index={idx}
                  pregunta={preg}
                  onChange={(nueva) => actualizarPregunta(idx, nueva)}
                  onEliminar={() => eliminarPregunta(idx)}
                />
              ))}
            </section>
          )}

          <button className="sd-btn-agregar" onClick={agregarPregunta}>
            <Plus size={15} /> Agregar pregunta opción múltiple
          </button>

          {/* ── Preguntas abiertas ── */}
          <section>
            <h3 className="sd-section-title" style={{ marginTop: '20px' }}>Preguntas abiertas</h3>
            <EditorAbierta
              titulo="Nivel Literal"
              nivel="literal"
              valor={literal}
              onChange={setLiteral}
            />
            <EditorAbierta
              titulo="Nivel Inferencial"
              nivel="inferencial"
              valor={inferencial}
              onChange={setInferencial}
            />
            <EditorAbierta
              titulo="Nivel Crítico"
              nivel="critico"
              valor={critico}
              onChange={setCritico}
            />
          </section>

          {/* ── Botón guardar ── */}
          <div className="sd-footer">
            <button className="sd-btn-guardar" onClick={handleGuardar} disabled={guardando}>
              {guardando ? <Loader2 size={15} className="sd-spin" /> : <Save size={15} />}
              {guardando ? 'Guardando...' : 'Guardar preguntas'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   COMPONENTE RAÍZ: SECCIONES
══════════════════════════════════════════════════════════ */
export default function SeccionesDocente() {
  const [lecturas, setLecturas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await obtenerLibros();
        setLecturas(Array.isArray(data) ? data : []);
      } catch (err) {
        setError('No se pudo cargar las lecturas.');
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  return (
    <div className="dashboard-body">
      <section className="card-section">
        <div className="card-header-blue">
          Secciones — Gestión de preguntas por lectura
        </div>

        <div className="sd-description">
          Crea y administra las preguntas para tus alumnos en esta sección.
        </div>

        {cargando && <div className="dashboard-empty">Cargando lecturas...</div>}
        {error && (
          <div className="dashboard-alert">
            <AlertTriangle size={17} /> <span>{error}</span>
          </div>
        )}
        {!cargando && lecturas.length === 0 && !error && (
          <div className="dashboard-empty">
            No hay lecturas subidas. Ve a <strong>Lecturas</strong> para subir una.
          </div>
        )}

        <div className="sd-lista">
          {lecturas.map((l) => (
            <PanelLectura key={l._id} lectura={l} />
          ))}
        </div>
      </section>
    </div>
  );
}
