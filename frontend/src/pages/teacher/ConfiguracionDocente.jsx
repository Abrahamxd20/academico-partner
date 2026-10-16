import React, { useContext, useEffect, useState } from 'react';
import {
  User, Mail, Lock, Building2, Clock, Target,
  GraduationCap, Wand2, BookMarked, Save, CheckCircle2,
  AlertTriangle, Eye, EyeOff, Loader2,
} from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import { obtenerPerfil, actualizarPerfil, actualizarConfigDocente } from '../../services/perfilService';
import './ConfiguracionDocente.css';

/* ─── constantes ─────────────────────────────────────────── */
const NIVELES = [ 'Secundaria'];
const ESTRATEGIAS_DISP = [
  'Lectura guiada',
  'Lectura en voz alta',
  'Lectura silenciosa',
  'Lectura compartida',
  'Lectura independiente',
];

/* ─── helper: aviso inline ───────────────────────────────── */
function Aviso({ aviso, onClose }) {
  if (!aviso) return null;
  return (
    <div className={`cfg-aviso cfg-aviso-${aviso.tipo}`}>
      {aviso.tipo === 'ok'
        ? <CheckCircle2 size={15} />
        : <AlertTriangle size={15} />}
      <span>{aviso.texto}</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   BLOQUE 1 — PERFIL PERSONAL
══════════════════════════════════════════════════════════ */
function BloquePerfil({ perfil, onGuardado }) {
  const { actualizarUsuario } = useContext(AuthContext);
  const [form, setForm] = useState({
    nombre: perfil?.nombre || '',
    apellido: perfil?.apellido || '',
    email: perfil?.email || '',
    passwordActual: '',
    passwordNueva: '',
    passwordConfirm: '',
  });
  const [mostrarPass, setMostrarPass] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);

  // Sincroniza si llegan datos del padre
  useEffect(() => {
    if (perfil) {
      setForm((f) => ({
        ...f,
        nombre: perfil.nombre || '',
        apellido: perfil.apellido || '',
        email: perfil.email || '',
      }));
    }
  }, [perfil]);

  const set = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });

  const guardar = async (e) => {
    e.preventDefault();
    if (form.passwordNueva && form.passwordNueva !== form.passwordConfirm) {
      setAviso({ tipo: 'error', texto: 'Las contraseñas nuevas no coinciden.' });
      return;
    }
    setGuardando(true);
    setAviso(null);
    try {
      const payload = {
        nombre: form.nombre,
        apellido: form.apellido,
        email: form.email,
        ...(form.passwordNueva && {
          passwordActual: form.passwordActual,
          passwordNueva: form.passwordNueva,
        }),
      };
      const data = await actualizarPerfil(payload);
      // Actualiza el contexto global → el header del dashboard muestra el nuevo nombre/email al instante
      actualizarUsuario(data.user);
      setForm((f) => ({ ...f, passwordActual: '', passwordNueva: '', passwordConfirm: '' }));
      setAviso({ tipo: 'ok', texto: 'Perfil actualizado correctamente.' });
      if (onGuardado) onGuardado(data.user);
    } catch (err) {
      setAviso({ tipo: 'error', texto: err.response?.data?.message || 'No se pudo guardar el perfil.' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="card-section cfg-card">
      <div className="card-header-blue cfg-header">
        <User size={16} /> Perfil personal
      </div>
      <form className="cfg-form" onSubmit={guardar}>
        {/* Avatar decorativo */}
        <div className="cfg-avatar-row">
          <div className="cfg-avatar">
            <span>{(form.nombre[0] || '?').toUpperCase()}{(form.apellido[0] || '').toUpperCase()}</span>
          </div>
          <div>
            <p className="cfg-avatar-name">{form.nombre} {form.apellido}</p>
            <p className="cfg-avatar-sub">@{perfil?.username || '—'} · {perfil?.rol}</p>
          </div>
        </div>

        <div className="cfg-grid-2">
          <label className="cfg-label">
            <span><User size={13} /> Nombre</span>
            <input className="cfg-input" value={form.nombre} onChange={set('nombre')} required />
          </label>
          <label className="cfg-label">
            <span><User size={13} /> Apellido</span>
            <input className="cfg-input" value={form.apellido} onChange={set('apellido')} required />
          </label>
        </div>

        <label className="cfg-label">
          <span><Mail size={13} /> Correo electrónico</span>
          <input className="cfg-input" type="email" value={form.email} onChange={set('email')} required />
        </label>

        <div className="cfg-divider">
          <Lock size={13} /> Cambiar contraseña <span>(dejar en blanco para no cambiar)</span>
        </div>

        <label className="cfg-label">
          <span>Contraseña actual</span>
          <div className="cfg-pass-wrap">
            <input
              className="cfg-input"
              type={mostrarPass ? 'text' : 'password'}
              value={form.passwordActual}
              onChange={set('passwordActual')}
              placeholder="Escribe tu contraseña actual"
              autoComplete="current-password"
            />
            <button type="button" className="cfg-pass-eye" title={mostrarPass ? 'Ocultar lo que escribes' : 'Mostrar lo que escribes'}
              onClick={() => setMostrarPass(!mostrarPass)}>
              {mostrarPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <span className="cfg-hint">
            Por seguridad, la contraseña guardada está cifrada y no se puede mostrar. El ojo muestra lo que tú escribes.
          </span>
        </label>

        <div className="cfg-grid-2">
          <label className="cfg-label">
            <span>Nueva contraseña</span>
            <input
              className="cfg-input"
              type={mostrarPass ? 'text' : 'password'}
              value={form.passwordNueva}
              onChange={set('passwordNueva')}
              placeholder="Mín. 6 caracteres"
              autoComplete="new-password"
            />
          </label>
          <label className="cfg-label">
            <span>Confirmar nueva contraseña</span>
            <input
              className="cfg-input"
              type={mostrarPass ? 'text' : 'password'}
              value={form.passwordConfirm}
              onChange={set('passwordConfirm')}
              placeholder="Repite la contraseña"
              autoComplete="new-password"
            />
          </label>
        </div>

        <Aviso aviso={aviso} />

        <div className="cfg-footer">
          <button className="cfg-btn-guardar" type="submit" disabled={guardando}>
            {guardando ? <Loader2 size={15} className="cfg-spin" /> : <Save size={15} />}
            {guardando ? 'Guardando...' : 'Guardar perfil'}
          </button>
        </div>
      </form>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════
   BLOQUE 2 — CONFIGURACIÓN PEDAGÓGICA
══════════════════════════════════════════════════════════ */
function BloqueConfigPedagogica({ config, onGuardado }) {
  const [form, setForm] = useState({
    institucion:       config?.institucion       ?? '',
    tiempoMaxEval:     config?.tiempoMaxEval     ?? 10,
    umbralAprobacion:  config?.umbralAprobacion  ?? 60,
    nivelEducativo:    config?.nivelEducativo     ?? 'Secundaria',
    cantPreguntasIA:   config?.cantPreguntasIA   ?? 3,
    estrategiaDefault: config?.estrategiaDefault  ?? [],
  });
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    if (config) {
      setForm({
        institucion:       config.institucion       ?? '',
        tiempoMaxEval:     config.tiempoMaxEval     ?? 10,
        umbralAprobacion:  config.umbralAprobacion  ?? 60,
        nivelEducativo:    config.nivelEducativo     ?? 'Secundaria',
        cantPreguntasIA:   config.cantPreguntasIA   ?? 3,
        estrategiaDefault: config.estrategiaDefault  ?? [],
      });
    }
  }, [config]);

  const set = (campo) => (e) =>
    setForm({ ...form, [campo]: e.target.type === 'number' ? Number(e.target.value) : e.target.value });

  const toggleEstrategia = (est) => {
    const ya = form.estrategiaDefault.includes(est);
    setForm({
      ...form,
      estrategiaDefault: ya
        ? form.estrategiaDefault.filter((e) => e !== est)
        : [...form.estrategiaDefault, est],
    });
  };

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setAviso(null);
    try {
      const data = await actualizarConfigDocente(form);
      setAviso({ tipo: 'ok', texto: 'Configuración pedagógica guardada.' });
      if (onGuardado) onGuardado(data.configDocente);
    } catch (err) {
      setAviso({ tipo: 'error', texto: err.response?.data?.message || 'No se pudo guardar.' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="card-section cfg-card">
      <div className="card-header-blue cfg-header">
        <GraduationCap size={16} /> Configuración pedagógica
      </div>
      <form className="cfg-form" onSubmit={guardar}>

        <label className="cfg-label">
          <span><Building2 size={13} /> Institución educativa</span>
          <input
            className="cfg-input"
            value={form.institucion}
            onChange={set('institucion')}
            placeholder="Ej: I.E. 5087 Héroes del Pacífico"
          />
        </label>

        <div className="cfg-grid-2">
          <label className="cfg-label">
            <span><Clock size={13} /> Tiempo máximo de evaluación (minutos)</span>
            <input
              className="cfg-input"
              type="number" min="1" max="180"
              value={form.tiempoMaxEval}
              onChange={set('tiempoMaxEval')}
            />
            <span className="cfg-hint">Usado para calcular la Eficiencia (ETR). Por defecto: 10 min.</span>
          </label>
          <label className="cfg-label">
            <span><Target size={13} /> Umbral de aprobación (%)</span>
            <input
              className="cfg-input"
              type="number" min="0" max="100"
              value={form.umbralAprobacion}
              onChange={set('umbralAprobacion')}
            />
            <span className="cfg-hint">% mínimo de aciertos para considerar que el alumno aprobó.</span>
          </label>
        </div>

        <div className="cfg-grid-2">
          <label className="cfg-label">
            <span><GraduationCap size={13} /> Nivel educativo del grupo</span>
            <select className="cfg-input cfg-select" value={form.nivelEducativo} onChange={set('nivelEducativo')}>
              {NIVELES.map((n) => <option key={n}>{n}</option>)}
            </select>
            <span className="cfg-hint">La IA ajusta el lenguaje de las preguntas al nivel indicado.</span>
          </label>
          <label className="cfg-label">
            <span><Wand2 size={13} /> Nº de preguntas que genera la IA</span>
            <input
              className="cfg-input"
              type="number" min="1" max="10"
              value={form.cantPreguntasIA}
              onChange={set('cantPreguntasIA')}
            />
            <span className="cfg-hint">Preguntas de opción múltiple por lectura (1 – 10).</span>
          </label>
        </div>

        <div className="cfg-label">
          <span><BookMarked size={13} /> Estrategias de lectura por defecto</span>
          <div className="cfg-chips">
            {ESTRATEGIAS_DISP.map((est) => (
              <button
                key={est}
                type="button"
                className={`cfg-chip ${form.estrategiaDefault.includes(est) ? 'activo' : ''}`}
                onClick={() => toggleEstrategia(est)}
              >
                {est}
              </button>
            ))}
          </div>
          <span className="cfg-hint">Se asignarán automáticamente a las nuevas lecturas que subas.</span>
        </div>

        <Aviso aviso={aviso} />

        <div className="cfg-footer">
          <button className="cfg-btn-guardar" type="submit" disabled={guardando}>
            {guardando ? <Loader2 size={15} className="cfg-spin" /> : <Save size={15} />}
            {guardando ? 'Guardando...' : 'Guardar configuración'}
          </button>
        </div>
      </form>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════
   COMPONENTE RAÍZ
══════════════════════════════════════════════════════════ */
export default function ConfiguracionDocente() {
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await obtenerPerfil();
        setPerfil(data);
      } catch {
        setError('No se pudo cargar el perfil. Intenta recargar la página.');
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  if (cargando) {
    return (
      <div className="dashboard-body">
        <div className="dashboard-empty">Cargando configuración...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-body">
        <div className="dashboard-alert">
          <AlertTriangle size={17} /> <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-body">
      <BloquePerfil
        perfil={perfil}
        onGuardado={(userActualizado) => setPerfil((p) => ({ ...p, ...userActualizado }))}
      />
      <BloqueConfigPedagogica
        config={perfil?.configDocente}
        onGuardado={(cfg) => setPerfil((p) => ({ ...p, configDocente: cfg }))}
      />
    </div>
  );
}
