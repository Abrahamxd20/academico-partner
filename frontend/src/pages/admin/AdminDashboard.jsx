import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Activity, BookOpen, GraduationCap, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import api from '../../services/api';
import AdminNavigation from '../../components/AdminNavigation';

const numero = (value) => Number(value || 0).toLocaleString('es-PE');
const fecha = (value) => value ? new Date(value).toLocaleString('es-PE') : '—';

export default function AdminDashboard() {
  const { user } = useContext(AuthContext);
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [acciones, setAcciones] = useState([]);
  const [paginaAcciones, setPaginaAcciones] = useState(1);
  const [hayMasAcciones, setHayMasAcciones] = useState(false);
  const [cargandoAcciones, setCargandoAcciones] = useState(false);
  const [filtroUsuario, setFiltroUsuario] = useState('');
  const [filtroAccion, setFiltroAccion] = useState('');
  const [filtrosAplicados, setFiltrosAplicados] = useState({ usuario: '', accion: '' });

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const res = await api.get('/dashboard/admin');
      setData(res.data);
      const auditoria = await api.get('/dashboard/admin/acciones', { params: { pagina: 1, limite: 50, ...filtrosAplicados } });
      setAcciones(auditoria.data.acciones || []);
      setPaginaAcciones(1);
      setHayMasAcciones(auditoria.data.hayMas);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo cargar el monitoreo.');
    } finally {
      setCargando(false);
    }
  }, [filtrosAplicados]);

  const cargarMasAcciones = async () => {
    setCargandoAcciones(true);
    try {
      const siguiente = paginaAcciones + 1;
      const res = await api.get('/dashboard/admin/acciones', { params: { pagina: siguiente, limite: 50, ...filtrosAplicados } });
      setAcciones((actuales) => [...actuales, ...(res.data.acciones || [])]);
      setPaginaAcciones(siguiente);
      setHayMasAcciones(res.data.hayMas);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo cargar más historial.');
    } finally {
      setCargandoAcciones(false);
    }
  };

  useEffect(() => { cargar(); }, [cargar]);

  const totales = data?.totales || {};
  const aplicarFiltros = (event) => {
    event.preventDefault();
    setFiltrosAplicados({ usuario: filtroUsuario.trim(), accion: filtroAccion.trim() });
    setPaginaAcciones(1);
  };
  const limpiarFiltros = () => {
    setFiltroUsuario('');
    setFiltroAccion('');
    setFiltrosAplicados({ usuario: '', accion: '' });
    setPaginaAcciones(1);
  };
  const tarjetas = [
    { label: 'Usuarios activos', value: totales.usuarios, icon: Users },
    { label: 'Alumnos', value: totales.alumnos, icon: GraduationCap },
    { label: 'Docentes', value: totales.docentes, icon: ShieldCheck },
    { label: 'Cursos', value: totales.cursos, icon: BookOpen },
    { label: 'Lecturas', value: totales.lecturas, icon: BookOpen },
    { label: 'Intentos registrados', value: totales.intentos, icon: Activity },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', padding: '24px', color: '#1e293b' }}>
      <main style={{ maxWidth: 1180, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 25, fontWeight: 700 }}>Panel de administración</h1>
            <p style={{ color: '#64748b', marginTop: 4 }}>Monitoreo general · {user?.nombre || 'Administrador'}</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={cargar} disabled={cargando} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', cursor: 'pointer' }}><RefreshCw size={16} /> Actualizar</button>
          </div>
        </header>

        <AdminNavigation />

        {error && <p role="alert" style={{ padding: 14, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, marginBottom: 16 }}>{error}</p>}
        {cargando && !data && <p style={{ color: '#64748b', marginBottom: 16 }}>Cargando resumen…</p>}

        <section aria-label="Resumen del proyecto" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: 14, marginBottom: 22 }}>
          {tarjetas.map(({ label, value, icon: Icon }) => (
            <article key={label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18 }}>
              <Icon size={19} color="#4f46e5" />
              <p style={{ color: '#64748b', fontSize: 13, marginTop: 12 }}>{label}</p>
              <strong style={{ display: 'block', fontSize: 26, marginTop: 3 }}>{cargando && !data ? '…' : numero(value)}</strong>
            </article>
          ))}
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
          <article style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18, overflowX: 'auto' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Actividad de aprendizaje reciente</h2>
            {!data?.actividadReciente?.length ? <p style={{ color: '#64748b' }}>Todavía no hay intentos registrados.</p> : (
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                <thead><tr>{['Fecha', 'Alumno', 'Lectura', 'Aciertos'].map((x) => <th key={x} style={{ textAlign: 'left', padding: '9px 7px', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>{x}</th>)}</tr></thead>
                <tbody>{data.actividadReciente.map((item) => <tr key={item._id}>
                  <td style={{ padding: '9px 7px', borderBottom: '1px solid #f1f5f9' }}>{fecha(item.fecha)}</td>
                  <td style={{ padding: '9px 7px', borderBottom: '1px solid #f1f5f9' }}>{[item.alumnoId?.nombre, item.alumnoId?.apellido].filter(Boolean).join(' ') || 'Alumno'}</td>
                  <td style={{ padding: '9px 7px', borderBottom: '1px solid #f1f5f9' }}>{item.readingId?.titulo || 'Lectura'}</td>
                  <td style={{ padding: '9px 7px', borderBottom: '1px solid #f1f5f9' }}>{numero(item.porcentajeAciertos)}%</td>
                </tr>)}</tbody>
              </table>
            )}
          </article>

          <article style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18, overflowX: 'auto' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Usuarios registrados recientemente</h2>
            {!data?.usuariosRecientes?.length ? <p style={{ color: '#64748b' }}>Todavía no hay usuarios registrados.</p> : (
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                <thead><tr>{['Nombre', 'Correo', 'Rol', 'Registro'].map((x) => <th key={x} style={{ textAlign: 'left', padding: '9px 7px', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>{x}</th>)}</tr></thead>
                <tbody>{data.usuariosRecientes.map((item) => <tr key={item._id}>
                  <td style={{ padding: '9px 7px', borderBottom: '1px solid #f1f5f9' }}>{[item.nombre, item.apellido].filter(Boolean).join(' ')}</td>
                  <td style={{ padding: '9px 7px', borderBottom: '1px solid #f1f5f9' }}>{item.email}</td>
                  <td style={{ padding: '9px 7px', borderBottom: '1px solid #f1f5f9' }}>{item.rol}</td>
                  <td style={{ padding: '9px 7px', borderBottom: '1px solid #f1f5f9' }}>{fecha(item.createdAt)}</td>
                </tr>)}</tbody>
              </table>
            )}
          </article>
        </section>

        <section style={{ marginTop: 18 }}>
          <article style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18, overflowX: 'auto' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Historial de acciones</h2>
            <form onSubmit={aplicarFiltros} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <input aria-label="Buscar usuario en historial" value={filtroUsuario} onChange={(e) => setFiltroUsuario(e.target.value)} placeholder="Filtrar por correo, nombre o ID del usuario" style={{ flex: '1 1 260px', minWidth: 220, padding: '9px 11px', border: '1px solid #cbd5e1', borderRadius: 8 }} />
              <input aria-label="Filtrar por acción" value={filtroAccion} onChange={(e) => setFiltroAccion(e.target.value)} placeholder="Acción exacta, ej. usuario.actualizado" style={{ flex: '1 1 220px', minWidth: 200, padding: '9px 11px', border: '1px solid #cbd5e1', borderRadius: 8 }} />
              <button type="submit" style={{ padding: '9px 14px', border: 0, borderRadius: 8, background: '#4f46e5', color: '#fff', cursor: 'pointer' }}>Filtrar</button>
              <button type="button" onClick={limpiarFiltros} style={{ padding: '9px 14px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', cursor: 'pointer' }}>Limpiar</button>
            </form>
            {!acciones.length ? <p style={{ color: '#64748b' }}>Todavía no hay acciones registradas.</p> : (
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 780, fontSize: 13 }}>
                <thead><tr>{['Fecha', 'Quién realizó la acción', 'Rol', 'Usuario afectado', 'Acción', 'Elemento', 'Detalle', 'Integridad'].map((x) => <th key={x} style={{ textAlign: 'left', padding: '9px 7px', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>{x}</th>)}</tr></thead>
                <tbody>{acciones.map((item) => {
                  const actor = item.actorId;
                  const nombre = [actor?.nombre, actor?.apellido].filter(Boolean).join(' ') || actor?.email || 'Usuario';
                  const afectado = item.affectedUserId;
                  const nombreAfectado = afectado ? ([afectado.nombre, afectado.apellido].filter(Boolean).join(' ') || afectado.email || String(afectado._id || afectado)) : '—';
                  const detalle = item.details || {};
                  const resumen = detalle.respuestasCorrectas !== undefined
                    ? `${detalle.respuestasCorrectas}/${detalle.totalPreguntas} aciertos · ${numero(detalle.porcentajeAciertos)}%`
                    : [
                      detalle.campos?.length ? `Campos: ${detalle.campos.join(', ')}` : '',
                      detalle.rolAnterior || detalle.rolNuevo ? `Rol: ${detalle.rolAnterior || '—'} → ${detalle.rolNuevo || '—'}` : '',
                      detalle.versionActual ? `Plan: v${detalle.versionAnterior} → v${detalle.versionActual}` : '',
                      Number.isFinite(detalle.cantidad) ? `Alumnos: ${detalle.cantidad}` : '',
                      detalle.puntaje !== undefined ? `Puntaje: ${detalle.puntaje}` : '',
                      detalle.puntajeRestaurado !== undefined ? `Restaurado: ${detalle.puntajeRestaurado}` : '',
                      detalle.titulo ? `Lectura: ${detalle.titulo}` : '',
                      detalle.estado ? `Estado: ${detalle.estado}` : '',
                      detalle.tipoConsulta ? `Consulta: ${detalle.tipoConsulta} (${detalle.caracteresMensaje || 0} caracteres)` : '',
                      detalle.alertaIntegridad ? 'Discrepancia de puntaje' : '',
                    ].filter(Boolean).join(' · ') || `HTTP ${detalle.status || 'acción registrada'}`;
                  return <tr key={item._id} style={{ background: item.integridadValida ? 'transparent' : '#fef2f2' }}>
                    <td style={{ padding: '9px 7px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>{fecha(item.createdAt)}</td>
                    <td style={{ padding: '9px 7px', borderBottom: '1px solid #f1f5f9' }}>{nombre}</td>
                    <td style={{ padding: '9px 7px', borderBottom: '1px solid #f1f5f9' }}>{item.actorRole}</td>
                    <td style={{ padding: '9px 7px', borderBottom: '1px solid #f1f5f9' }}>{nombreAfectado}</td>
                    <td style={{ padding: '9px 7px', borderBottom: '1px solid #f1f5f9' }}>{item.action}</td>
                    <td style={{ padding: '9px 7px', borderBottom: '1px solid #f1f5f9' }}>{item.entity}{item.entityId ? ` · ${String(item.entityId).slice(-8)}` : ''}</td>
                    <td style={{ padding: '9px 7px', borderBottom: '1px solid #f1f5f9' }}>{resumen}{detalle.alertaIntegridad ? ' · discrepancia de puntaje' : ''}</td>
                    <td style={{ padding: '9px 7px', borderBottom: '1px solid #f1f5f9', color: item.integridadValida ? '#15803d' : '#b91c1c', fontWeight: 600 }}>{item.integridadValida ? 'Verificada' : 'ALERTA'}</td>
                  </tr>;
                })}</tbody>
              </table>
            )}
            {hayMasAcciones && <button onClick={cargarMasAcciones} disabled={cargandoAcciones} style={{ marginTop: 12, padding: '9px 14px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', cursor: 'pointer' }}>{cargandoAcciones ? 'Cargando…' : 'Cargar más acciones'}</button>}
          </article>
        </section>
        <p style={{ color: '#64748b', fontSize: 12, marginTop: 14 }}>Datos al momento de la última actualización.</p>
      </main>
    </div>
  );
}
