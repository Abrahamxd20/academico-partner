import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, MapPin, RefreshCw } from 'lucide-react';
import { obtenerCurso } from '../../services/cursoService';

const claveDia = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const inicioDia = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const hora = (value) => new Date(value).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

export default function CalendarioSesiones({ cursos = [], onAbrirCurso }) {
  const [eventos, setEventos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [mes, setMes] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [seleccionado, setSeleccionado] = useState(() => claveDia(new Date()));

  const cargar = async () => {
    if (!cursos.length) { setEventos([]); return; }
    setCargando(true);
    setError('');
    try {
      const resultados = await Promise.allSettled(cursos.map((curso) => obtenerCurso(curso._id)));
      const lista = resultados.flatMap((resultado, index) => {
        if (resultado.status !== 'fulfilled') return [];
        const curso = resultado.value;
        return (curso.sesiones || []).filter((sesion) => sesion.fechaProgramada).map((sesion) => ({
          id: `${curso._id}-${sesion._id}`,
          cursoId: curso._id,
          curso: curso.nombre,
          grado: curso.grado,
          seccion: curso.seccion,
          titulo: sesion.titulo,
          fecha: new Date(sesion.fechaProgramada),
          temas: sesion.temas,
        }));
      });
      lista.sort((a, b) => a.fecha - b.fecha);
      setEventos(lista);
      if (resultados.every((r) => r.status === 'rejected')) setError('No se pudieron cargar las sesiones de tus cursos.');
    } catch {
      setError('No se pudieron cargar las sesiones programadas.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, [cursos]);

  const dias = useMemo(() => {
    const primero = new Date(mes.getFullYear(), mes.getMonth(), 1);
    const desplazamiento = (primero.getDay() + 6) % 7;
    const totalDias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
    return [
      ...Array.from({ length: desplazamiento }, (_, i) => ({ key: `prev-${i}`, fuera: true })),
      ...Array.from({ length: totalDias }, (_, i) => {
        const fechaDia = new Date(mes.getFullYear(), mes.getMonth(), i + 1);
        const key = claveDia(fechaDia);
        return { key, fecha: fechaDia, eventos: eventos.filter((evento) => claveDia(evento.fecha) === key) };
      }),
    ];
  }, [mes, eventos]);

  const sesionesDia = eventos.filter((evento) => evento.key === seleccionado || claveDia(evento.fecha) === seleccionado);
  const mesLabel = mes.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
  const hoy = claveDia(new Date());

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>Calendario de sesiones</h2>
          <p style={{ color: '#64748b', marginTop: 4 }}>Sesiones con fecha y hora programadas en tus cursos.</p>
        </div>
        <button type="button" onClick={cargar} disabled={cargando} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 7, background: '#fff', cursor: 'pointer' }}>
          <RefreshCw size={15} /> {cargando ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>
      {error && <p role="alert" style={{ color: '#b91c1c', background: '#fef2f2', padding: 12, borderRadius: 7, marginBottom: 14 }}>{error}</p>}
      {!cargando && !error && eventos.length === 0 && (
        <p style={{ color: '#475569', background: '#eff6ff', padding: 12, borderRadius: 7, marginBottom: 14 }}>
          No hay sesiones programadas. Entra a «Carpetas de Aprendizaje», edita o crea una sesión y agrega su fecha y hora.
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.2fr) minmax(280px, .8fr)', gap: 18 }} className="cal-sesiones-layout">
        <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18 }} aria-label="Calendario mensual">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <button aria-label="Mes anterior" onClick={() => { const nuevoMes = new Date(mes.getFullYear(), mes.getMonth() - 1, 1); setMes(nuevoMes); setSeleccionado(claveDia(nuevoMes)); }} style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 6 }}><ChevronLeft /></button>
            <h3 style={{ textTransform: 'capitalize', fontWeight: 700 }}>{mesLabel}</h3>
            <button aria-label="Mes siguiente" onClick={() => { const nuevoMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 1); setMes(nuevoMes); setSeleccionado(claveDia(nuevoMes)); }} style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 6 }}><ChevronRight /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, textAlign: 'center', color: '#64748b', fontSize: 12, marginBottom: 7 }}>
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((dia) => <strong key={dia}>{dia}</strong>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {dias.map((dia) => {
              if (dia.fuera) return <span key={dia.key} />;
              const activo = dia.key === seleccionado;
              const tieneEvento = dia.eventos.length > 0;
              return <button key={dia.key} type="button" onClick={() => setSeleccionado(dia.key)} aria-label={`${dia.fecha.getDate()}${tieneEvento ? `, ${dia.eventos.length} sesiones` : ''}`}
                style={{ minHeight: 48, border: activo ? '2px solid #1a6fc9' : '1px solid #e2e8f0', borderRadius: 8, background: activo ? '#eff6ff' : '#fff', color: '#1e293b', cursor: 'pointer', position: 'relative', fontWeight: dia.key === hoy ? 700 : 400 }}>
                {dia.fecha.getDate()}
                {tieneEvento && <span aria-hidden="true" style={{ display: 'block', width: 6, height: 6, borderRadius: '50%', background: '#1a6fc9', margin: '3px auto 0' }} />}
              </button>;
            })}
          </div>
        </section>

        <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>{new Date(`${seleccionado}T12:00:00`).toLocaleDateString('es-PE', { dateStyle: 'full' })}</h3>
          {!sesionesDia.length ? <p style={{ color: '#64748b' }}>No hay sesiones para este día.</p> : (
            <div style={{ display: 'grid', gap: 10 }}>
              {sesionesDia.map((evento) => <article key={evento.id} style={{ borderLeft: '3px solid #1a6fc9', background: '#f8fafc', padding: 12, borderRadius: '0 8px 8px 0' }}>
                <strong>{evento.titulo}</strong>
                <p style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#475569', fontSize: 13, marginTop: 7 }}><Clock size={14} /> {hora(evento.fecha)}</p>
                <p style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#475569', fontSize: 13, marginTop: 4 }}><MapPin size={14} /> {evento.curso} · {evento.grado} «{evento.seccion}»</p>
                {evento.temas && <p style={{ color: '#64748b', fontSize: 13, marginTop: 7 }}>{evento.temas}</p>}
                <button type="button" onClick={() => onAbrirCurso?.(evento.cursoId)} style={{ marginTop: 10, border: '1px solid #1a6fc9', color: '#1a6fc9', background: '#fff', padding: '6px 10px', borderRadius: 6, cursor: 'pointer' }}>Ver curso</button>
              </article>)}
            </div>
          )}
        </section>
      </div>
      <style>{'@media(max-width:760px){.cal-sesiones-layout{grid-template-columns:1fr!important}}'}</style>
    </div>
  );
}
