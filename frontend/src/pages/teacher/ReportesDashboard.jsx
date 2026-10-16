import React, { useCallback, useEffect, useState } from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Filler, Tooltip, Legend,
} from 'chart.js';
import { Download, RefreshCw, AlertTriangle } from 'lucide-react';
import { obtenerReporte, descargarFichaObservacion, obtenerNotas, obtenerBorradores, obtenerHistorialNota, ajustarNota, restaurarNota } from '../../services/reporteService';
import './ReportesDashboard.css';

// Plugin propio: escribe el valor sobre cada barra/punto (como en el dashboard de referencia)
const etiquetasValor = {
  id: 'etiquetasValor',
  afterDatasetsDraw(chart, _args, opts) {
    if (!opts?.mostrar) return;
    const { ctx } = chart;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = '11px "Segoe UI", sans-serif';
    chart.data.datasets.forEach((ds, i) => {
      chart.getDatasetMeta(i).data.forEach((el, idx) => {
        const v = ds.data[idx];
        if (v === null || v === undefined) return;
        const txt = `${Number.isInteger(v) ? v : Number(v).toFixed(1)}${opts.sufijo || ''}`;
        if (opts.horizontal) {
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(txt, el.x + 6, el.y);
        } else {
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillText(txt, el.x, el.y - 6);
        }
      });
    });
    ctx.restore();
  },
};

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Filler, Tooltip, Legend, etiquetasValor);

const NIVELES = [
  { id: 'general', label: 'General', medida: 'IDLI', sufijo: '%' },
  { id: 'literal', label: 'Literal', medida: 'Inflesz', sufijo: '' },
  { id: 'inferencial', label: 'Inferencial', medida: 'ROUGE-L', sufijo: '%' },
  { id: 'critico', label: 'Crítico', medida: 'ROUGE-S', sufijo: '%' },
];
const COLOR_BARRA = '#6f78c8';
const COLORES_BANDA = ['#5c6bd6', '#9ea3d9', '#f2c777', '#f08a9b'];
const FILTROS_INICIALES = { grado: '', seccion: '', lecturaId: '', desde: '', hasta: '' };

const eje = () => ({ ticks: { color: '#e5e7fb', font: { size: 11 } }, grid: { display: false }, border: { display: false } });
const fmt = (v) => Number(v || 0).toLocaleString('es-PE', { maximumFractionDigits: 1 });

export default function ReportesDashboard() {
  const [nivel, setNivel] = useState('general');
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [descargando, setDescargando] = useState(false);
  const [notas, setNotas] = useState([]);
  const [paginaNotas, setPaginaNotas] = useState(1);
  const [hayMasNotas, setHayMasNotas] = useState(false);
  const [cargandoMasNotas, setCargandoMasNotas] = useState(false);
  const [paginaBorradores, setPaginaBorradores] = useState(1);
  const [hayMasBorradores, setHayMasBorradores] = useState(false);
  const [cargandoMasBorradores, setCargandoMasBorradores] = useState(false);
  const [notaActiva, setNotaActiva] = useState(null);
  const [historialNota, setHistorialNota] = useState([]);
  const [nivelAjuste, setNivelAjuste] = useState('general');
  const [valorAjuste, setValorAjuste] = useState('');
  const [motivoAjuste, setMotivoAjuste] = useState('');
  const [guardandoNota, setGuardandoNota] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [reporte, resultadoNotas] = await Promise.all([
        obtenerReporte({ nivel, ...filtros }), obtenerNotas({ ...filtros, pagina: 1, limite: 50 }),
      ]);
      setDatos(reporte);
      setPaginaBorradores(1);
      setHayMasBorradores(reporte.hayMasBorradores);
      setNotas(resultadoNotas.registros || []);
      setPaginaNotas(1);
      setHayMasNotas(resultadoNotas.hayMas);
      return { reporte, registros: resultadoNotas.registros || [] };
    } catch (err) {
      console.error('Error cargando reportes:', err);
      setError(err.response?.status === 403
        ? 'No tienes permiso para ver esta sección.'
        : 'No se pudo cargar la información. Verifica tu conexión o vuelve a iniciar sesión.');
    } finally {
      setCargando(false);
    }
  }, [nivel, filtros]);

  const cargarMasNotas = async () => {
    setCargandoMasNotas(true);
    try {
      const pagina = paginaNotas + 1;
      const resultado = await obtenerNotas({ ...filtros, pagina, limite: 50 });
      setNotas((actuales) => [...actuales, ...(resultado.registros || [])]);
      setPaginaNotas(pagina);
      setHayMasNotas(resultado.hayMas);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudieron cargar más notas.');
    } finally { setCargandoMasNotas(false); }
  };

  const cargarMasBorradores = async () => {
    setCargandoMasBorradores(true);
    try {
      const pagina = paginaBorradores + 1;
      const resultado = await obtenerBorradores({ ...filtros, pagina, limite: 50 });
      setDatos((actual) => ({ ...actual, borradores: [...(actual?.borradores || []), ...(resultado.borradores || [])] }));
      setPaginaBorradores(pagina);
      setHayMasBorradores(resultado.hayMas);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudieron cargar más avances.');
    } finally { setCargandoMasBorradores(false); }
  };

  useEffect(() => { cargar(); }, [cargar]);

  const cambiarFiltro = (campo) => (e) => setFiltros((f) => ({ ...f, [campo]: e.target.value }));

  const descargar = async () => {
    setDescargando(true);
    try {
      await descargarFichaObservacion(filtros);
    } catch (err) {
      setError(err.response?.status === 404
        ? 'No hay registros para exportar con los filtros seleccionados.'
        : err.response?.status === 413
          ? 'La descarga supera 5,000 registros. Aplica filtros de periodo, grado, sección o lectura y descárgala en partes.'
        : 'No se pudo generar la ficha de observación.');
    } finally {
      setDescargando(false);
    }
  };

  const abrirNota = async (nota) => {
    setNotaActiva(nota);
    setNivelAjuste('general');
    setValorAjuste(String(nota.valores.general ?? 0));
    setMotivoAjuste('');
    try { setHistorialNota((await obtenerHistorialNota(nota._id)).historial || []); }
    catch { setHistorialNota([]); }
  };

  const guardarAjuste = async (e) => {
    e.preventDefault();
    setGuardandoNota(true);
    try {
      await ajustarNota(notaActiva._id, { nivel: nivelAjuste, valor: Number(valorAjuste), motivo: motivoAjuste });
      const { registros } = await cargar();
      const actualizada = registros?.find((nota) => nota._id === notaActiva._id);
      if (actualizada) { setNotaActiva(actualizada); setValorAjuste(String(actualizada.valores[nivelAjuste] ?? 0)); }
      const historial = await obtenerHistorialNota(notaActiva._id);
      setHistorialNota(historial.historial || []);
      setMotivoAjuste('');
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo guardar el ajuste.');
    } finally { setGuardandoNota(false); }
  };

  const restaurarRevision = async (revision, lado) => {
    const quien = [revision.actorId?.nombre, revision.actorId?.apellido].filter(Boolean).join(' ') || 'otro usuario';
    const valor = lado === 'antes' ? revision.antes : revision.despues;
    if (!window.confirm(`¿Restaurar el puntaje ${valor} de ${revision.nivel}, registrado por ${quien}? Se guardará un nuevo movimiento en el historial.`)) return;
    setGuardandoNota(true);
    try {
      await restaurarNota(notaActiva._id, revision._id, `Restauración del valor ${lado} desde reportes`, lado);
      const historial = await obtenerHistorialNota(notaActiva._id);
      setHistorialNota(historial.historial || []);
      const { registros } = await cargar();
      const actualizada = registros?.find((item) => item._id === notaActiva._id);
      if (actualizada) { setNotaActiva(actualizada); setValorAjuste(String(actualizada.valores[nivelAjuste] ?? 0)); }
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo restaurar ese puntaje.');
    } finally { setGuardandoNota(false); }
  };

  const actual = NIVELES.find((n) => n.id === nivel);
  const kpis = datos?.kpis;
  const borradores = datos?.borradores || [];
  const sinDatos = !cargando && kpis && kpis.intentos === 0 && borradores.length === 0;
  const opciones = datos?.opciones || { grados: [], secciones: [], lecturas: [] };

  // Panel izquierdo: en "General" compara los 3 niveles; en un nivel concreto compara lecturas
  const barras = nivel === 'general'
    ? [
      { etiqueta: 'Literal', valor: datos?.porNivel.literal },
      { etiqueta: 'Inferencial', valor: datos?.porNivel.inferencial },
      { etiqueta: 'Crítico', valor: datos?.porNivel.critico },
    ]
    : (datos?.porLectura || []).slice(0, 6).map((l) => ({ etiqueta: l.lectura, valor: l.valor }));
  const sufijoBarras = nivel === 'literal' ? '' : '%';

  const comunes = { responsive: true, maintainAspectRatio: false };

  return (
    <div className="rp-root">
      <div className="rp-top">
        <div className="rp-tabs">
          {NIVELES.map((n) => (
            <button key={n.id} className={`rp-tab ${n.id === nivel ? 'activo' : ''}`} onClick={() => setNivel(n.id)}>
              {n.label}
            </button>
          ))}
        </div>
        <h1 className="rp-titulo">reportes | <b>comprensión lectora</b></h1>
        <button className="rp-descarga" onClick={descargar} disabled={descargando || sinDatos}>
          <Download size={16} /> {descargando ? 'Generando...' : 'Ficha de observación (Excel)'}
        </button>
      </div>

      {error && (
        <div className="rp-alerta">
          <AlertTriangle size={16} /> <span>{error}</span>
          <button onClick={cargar}><RefreshCw size={13} /> Reintentar</button>
        </div>
      )}
      {sinDatos && <div className="rp-aviso">No hay registros con los filtros seleccionados.</div>}

      <div className="rp-grid">
        <div className="rp-col">
          <div className="rp-fila">
            <section className="rp-card">
              <h3>Filtros</h3>
              <label className="rp-campo">Grado
                <select value={filtros.grado} onChange={cambiarFiltro('grado')}>
                  <option value="">Todos</option>
                  {opciones.grados.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
              <label className="rp-campo">Sección
                <select value={filtros.seccion} onChange={cambiarFiltro('seccion')}>
                  <option value="">Todas</option>
                  {opciones.secciones.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="rp-campo">Lectura
                <select value={filtros.lecturaId} onChange={cambiarFiltro('lecturaId')}>
                  <option value="">Todas</option>
                  {opciones.lecturas.map((l) => <option key={l.id} value={l.id}>{l.titulo}</option>)}
                </select>
              </label>
            </section>

            <section className="rp-card">
              <div className="rp-fechas">
                <label className="rp-campo">Desde<input type="date" value={filtros.desde} onChange={cambiarFiltro('desde')} /></label>
                <label className="rp-campo">Hasta<input type="date" value={filtros.hasta} onChange={cambiarFiltro('hasta')} /></label>
              </div>
              <h3>{actual.medida} promedio</h3>
              <div className="rp-kpi">
                {cargando && !datos ? '…' : `${fmt(kpis?.promedio)}${actual.sufijo}`}
                <small>{kpis?.intentos || 0} intentos · {kpis?.alumnos || 0} alumnos</small>
              </div>
            </section>
          </div>

          <section className="rp-card">
            <h3>{nivel === 'general' ? 'Promedio por Nivel' : 'Rendimiento por Lectura'}</h3>
            <div className="rp-chart">
              <Bar
                data={{ labels: barras.map((b) => b.etiqueta), datasets: [{ data: barras.map((b) => b.valor), backgroundColor: COLOR_BARRA, borderRadius: 2, barThickness: 20 }] }}
                options={{
                  ...comunes, indexAxis: 'y', layout: { padding: { right: 40 } },
                  plugins: { legend: { display: false }, etiquetasValor: { mostrar: true, horizontal: true, sufijo: sufijoBarras } },
                  scales: { x: { display: false, min: 0, max: 100 }, y: eje() },
                }}
              />
            </div>
          </section>

          <section className="rp-card">
            <h3>Niveles de Logro</h3>
            <div className="rp-chart">
              <Doughnut
                data={{
                  labels: (datos?.distribucion || []).map((d) => `${d.banda} ${fmt(d.porcentaje)}%`),
                  datasets: [{ data: (datos?.distribucion || []).map((d) => d.cantidad), backgroundColor: COLORES_BANDA, borderColor: '#372b52', borderWidth: 2 }],
                }}
                options={{ ...comunes, cutout: '58%', plugins: { legend: { position: 'right', labels: { color: '#ffffff', boxWidth: 12, font: { size: 12 } } } } }}
              />
            </div>
          </section>
        </div>

        <div className="rp-col">
          <section className="rp-card">
            <h3>Evolución de {actual.medida} por mes</h3>
            <div className="rp-chart alto">
              <Bar
                data={{ labels: (datos?.evolucion || []).map((e) => e.etiqueta), datasets: [{ data: (datos?.evolucion || []).map((e) => e.promedio), backgroundColor: COLOR_BARRA, borderRadius: 2 }] }}
                options={{
                  ...comunes, layout: { padding: { top: 20 } },
                  plugins: { legend: { display: false }, etiquetasValor: { mostrar: true, sufijo: actual.sufijo } },
                  scales: { x: eje(), y: { display: false, min: 0, max: 100 } },
                }}
              />
            </div>
          </section>

          <section className="rp-card">
            <h3>Cantidad de Intentos Realizados</h3>
            <div className="rp-chart alto">
              <Line
                data={{ labels: (datos?.evolucion || []).map((e) => e.etiqueta), datasets: [{ data: (datos?.evolucion || []).map((e) => e.intentos), borderColor: COLOR_BARRA, backgroundColor: 'rgba(111,120,200,0.45)', fill: true, tension: 0.2, pointRadius: 3, pointBackgroundColor: COLOR_BARRA }] }}
                options={{
                  ...comunes, layout: { padding: { top: 22, right: 12 } },
                  plugins: { legend: { display: false }, etiquetasValor: { mostrar: true } },
                  scales: { x: eje(), y: { display: false, min: 0, grace: '15%' } },
                }}
              />
            </div>
          </section>
        </div>
      </div>

      <section className="rp-card">
        <h3>Estudiantes que requieren más apoyo · {actual.label}</h3>
        {datos?.alumnos?.length ? (
          <div className="rp-tabla-wrap">
            <table className="rp-tabla">
              <thead><tr><th>Estudiante</th><th>Grado</th><th>Sección</th><th>Intentos</th><th>{actual.medida}</th><th>Valoración</th></tr></thead>
              <tbody>
                {datos.alumnos.map((a, i) => (
                  <tr key={`${a.nombre}-${i}`}>
                    <td>{a.nombre}</td><td>{a.grado || '—'}</td><td>{a.seccion || '—'}</td><td>{a.intentos}</td>
                    <td>{fmt(a.promedio)}{actual.sufijo}</td>
                    <td><span className="rp-chip" style={{ background: COLORES_BANDA[['Destacado', 'Logrado', 'En proceso', 'Requiere apoyo'].indexOf(a.banda)] }}>{a.banda}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="rp-vacio">Sin datos para mostrar.</div>}
      </section>

      <section className="rp-card" style={{ marginTop: 18 }}>
        <h3>Notas y niveles de logro · {notas.length} registros cargados</h3>
        <p>Los ajustes requieren un motivo y quedan asociados a la persona que los realizó. Puedes revisar o restaurar cualquier revisión.</p>
        {notas.length ? <div className="rp-tabla-wrap"><table className="rp-tabla">
          <thead><tr><th>Estudiante</th><th>Lectura</th><th>Plan</th><th>Fecha</th><th>General</th><th>Literal</th><th>Inferencial</th><th>Crítico</th><th>Historial</th></tr></thead>
          <tbody>{notas.map((nota) => <tr key={nota._id}>
            <td>{nota.alumno?.nombre || 'Alumno'}<br /><small>{nota.alumno?.grado || ''} {nota.alumno?.seccion || ''}</small></td>
            <td>{nota.lectura?.titulo || 'Lectura'}</td>
            <td>{nota.curso?.nombre || 'Sin curso'}<br /><small>{nota.planVersion ? `Versión ${nota.planVersion}` : 'Sin versión vinculada'}{nota.actividadId ? ` · Actividad ${String(nota.actividadId).slice(-6)}` : ''}</small></td>
            <td>{nota.fecha ? new Date(nota.fecha).toLocaleDateString('es-PE') : '—'}</td>
            {['general', 'literal', 'inferencial', 'critico'].map((key) => <td key={key}>{fmt(nota.valores[key])}{key === 'literal' ? '' : '%'}</td>)}
            <td><button className="rp-descarga" style={{ padding: '7px 10px' }} onClick={() => abrirNota(nota)}>Ver / ajustar</button></td>
          </tr>)}</tbody>
        </table></div> : <div className="rp-vacio">No hay notas con estos filtros.</div>}
        {hayMasNotas && <button className="rp-descarga" onClick={cargarMasNotas} disabled={cargandoMasNotas} style={{ marginTop: 12 }}>{cargandoMasNotas ? 'Cargando…' : 'Cargar más notas'}</button>}
      </section>

      <section className="rp-card" style={{ marginTop: 18 }}>
        <h3>Avance guardado de los estudiantes ({borradores.length} de {datos?.totalBorradores || 0})</h3>
        <p>Se muestran los 50 avances más recientes; puedes cargar más. El detalle presenta una vista resumida de respuestas y mensajes para mantener ágil el reporte.</p>
        {borradores.length ? (
          <div className="rp-tabla-wrap">
            <table className="rp-tabla">
              <thead><tr><th>Estudiante</th><th>Grado / sección</th><th>Lectura</th><th>Preguntas</th><th>Último avance</th><th>Respuestas guardadas</th></tr></thead>
              <tbody>{borradores.map((b, i) => (
                <tr key={`${b.alumno}-${b.lectura}-${i}`}>
                  <td>{b.alumno}</td><td>{b.grado || '—'} / {b.seccion || '—'}</td><td>{b.lectura}</td>
                  <td>{b.respuestasMarcadas}</td><td>{b.actualizadoEn ? new Date(b.actualizadoEn).toLocaleString('es-PE') : '—'}</td>
                  <td><details><summary>Ver detalle</summary><div style={{ minWidth: 260, whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto' }}>
                    <b>Literal:</b> {b.textoLiteral || 'Sin respuesta'}<br /><b>Inferencial:</b> {b.respuestaInferencial || 'Sin respuesta'}<br />
                    <b>Crítico:</b> {b.respuestaCritico || 'Sin respuesta'}<br /><b>Refuerzo:</b> {b.refuerzo || 'Sin generar'}<br />
                    <b>Vocabulario:</b> {(b.vocabulario || []).map((v) => v.palabra).join(', ') || '—'}<br />
                    <b>Asistente:</b>{(b.mensajesAsistente || []).length ? <ul style={{ marginTop: 4 }}>{b.mensajesAsistente.map((m, j) => <li key={j}><b>{m.emisor === 'user' ? 'Alumno' : 'Asistente'}:</b> {m.texto}</li>)}</ul> : ' Sin mensajes'}
                  </div></details></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="rp-vacio">No hay avances guardados con estos filtros.</div>}
        {hayMasBorradores && <button className="rp-descarga" onClick={cargarMasBorradores} disabled={cargandoMasBorradores} style={{ marginTop: 12 }}>{cargandoMasBorradores ? 'Cargando…' : 'Cargar más avances'}</button>}
      </section>

      {notaActiva && <div className="rp-modal-fondo" onClick={() => setNotaActiva(null)}>
        <section className="rp-modal" role="dialog" aria-modal="true" aria-label="Ajustar nota" onClick={(e) => e.stopPropagation()}>
          <header><div><h2>Historial y ajuste de nota</h2><p>{notaActiva.alumno?.nombre} · {notaActiva.lectura?.titulo}</p></div><button type="button" onClick={() => setNotaActiva(null)}>Cerrar</button></header>
          <form onSubmit={guardarAjuste}>
            <label>Nivel
              <select value={nivelAjuste} onChange={(e) => { setNivelAjuste(e.target.value); setValorAjuste(String(notaActiva.valores[e.target.value] ?? 0)); }}>
                {NIVELES.map((nivelItem) => <option key={nivelItem.id} value={nivelItem.id}>{nivelItem.label}</option>)}
              </select>
            </label>
            <label>Puntaje (0 a 100)
              <input type="number" min="0" max="100" step="0.01" required value={valorAjuste} onChange={(e) => setValorAjuste(e.target.value)} />
            </label>
            <label>Motivo obligatorio
              <textarea required maxLength={500} value={motivoAjuste} onChange={(e) => setMotivoAjuste(e.target.value)} placeholder="Describe por qué se corrige este puntaje" />
            </label>
            <button className="rp-descarga" disabled={guardandoNota}>{guardandoNota ? 'Guardando…' : 'Guardar ajuste'}</button>
          </form>
          <h3>Movimientos registrados</h3>
          {!historialNota.length ? <p>No hay ajustes anteriores para esta nota.</p> : <div className="rp-historial">
            {historialNota.map((revision) => <article key={revision._id}>
              <div><strong>{revision.nivel}: {revision.antes ?? 'sin ajuste'} → {revision.despues}</strong>
                <p>{revision.action === 'restauracion' ? 'Restauración' : 'Ajuste'} · {[revision.actorId?.nombre, revision.actorId?.apellido].filter(Boolean).join(' ') || revision.actorId?.email || 'Usuario'} · {new Date(revision.createdAt).toLocaleString('es-PE')}</p>
                <p>Motivo: {revision.motivo}</p>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" disabled={guardandoNota || Number(notaActiva.valores[revision.nivel]) === revision.antes} onClick={() => restaurarRevision(revision, 'antes')}>Restaurar anterior ({revision.antes})</button>
                <button type="button" disabled={guardandoNota || Number(notaActiva.valores[revision.nivel]) === revision.despues} onClick={() => restaurarRevision(revision, 'despues')}>Restaurar ajuste ({revision.despues})</button>
              </div>
            </article>)}
          </div>}
        </section>
      </div>}
    </div>
  );
}
