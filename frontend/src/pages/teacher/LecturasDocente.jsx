import React, { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../../config';
import { FileText, Upload, Archive, RotateCcw, Trash2, ExternalLink, AlertTriangle } from 'lucide-react';
import {
  obtenerLibros, subirLecturaPdf, cambiarEstadoLectura, eliminarLectura,
} from '../../services/bibliotecaService';
import './LecturasDocente.css';

const API_BASE = API_BASE_URL;

function formatearFecha(fechaISO) {
  const f = new Date(fechaISO);
  return f.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + f.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

export default function LecturasDocente() {
  const [lecturas, setLecturas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [titulo, setTitulo] = useState('');
  const [autor, setAutor] = useState('');
  const [categoria, setCategoria] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [avisoSubida, setAvisoSubida] = useState(null);
  const inputRef = useRef(null);

  const cargar = async () => {
    setCargando(true);
    setError(null);
    try {
      const data = await obtenerLibros();
      setLecturas(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error cargando lecturas:', err);
      setError('No se pudo cargar el historial de lecturas.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const elegirArchivo = (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setAvisoSubida({ tipo: 'error', texto: 'Solo se permiten archivos PDF.' });
      return;
    }
    setArchivo(file);
    if (!titulo) setTitulo(file.name.replace(/\.pdf$/i, ''));
    setAvisoSubida(null);
  };

  const manejarSoltar = (e) => {
    e.preventDefault();
    elegirArchivo(e.dataTransfer.files?.[0]);
  };

  const subir = async (e) => {
    e.preventDefault();
    if (!archivo) {
      setAvisoSubida({ tipo: 'error', texto: 'Selecciona un archivo PDF primero.' });
      return;
    }
    setSubiendo(true);
    setAvisoSubida(null);
    try {
      await subirLecturaPdf({ file: archivo, titulo, autor, categoria });
      setAvisoSubida({ tipo: 'ok', texto: 'Lectura subida correctamente. Ya está visible para tus alumnos.' });
      setTitulo(''); setAutor(''); setCategoria(''); setArchivo(null);
      if (inputRef.current) inputRef.current.value = '';
      cargar();
    } catch (err) {
      console.error('Error al subir la lectura:', err);
      setAvisoSubida({ tipo: 'error', texto: err.response?.data?.mensaje || 'No se pudo subir el archivo.' });
    } finally {
      setSubiendo(false);
    }
  };

  const alternarEstado = async (lectura) => {
    const nuevoEstado = lectura.estado === 'Publicado' ? 'Archivado' : 'Publicado';
    try {
      await cambiarEstadoLectura(lectura._id, nuevoEstado);
      cargar();
    } catch (err) {
      console.error('Error al cambiar el estado:', err);
    }
  };

  const eliminar = async (lectura) => {
    if (!window.confirm(`¿Eliminar definitivamente "${lectura.titulo}"? Esta acción no se puede deshacer.`)) return;
    try {
      await eliminarLectura(lectura._id);
      cargar();
    } catch (err) {
      console.error('Error al eliminar la lectura:', err);
    }
  };

  const publicadas = lecturas.filter((l) => l.estado === 'Publicado').length;

  return (
    <div className="dashboard-body">
      {error && (
        <div className="dashboard-alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button onClick={cargar} className="dashboard-retry-btn">Reintentar</button>
        </div>
      )}

      <section className="card-section">
        <div className="card-header-blue">Subir nueva lectura (PDF)</div>
        <form className="ld-form" onSubmit={subir}>
          <div
            className={`ld-dropzone ${archivo ? 'con-archivo' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={manejarSoltar}
            onClick={() => inputRef.current?.click()}
          >
            <FileText size={28} />
            {archivo ? (
              <p className="ld-archivo-nombre">{archivo.name}</p>
            ) : (
              <>
                <p className="ld-drop-title">Arrastra un PDF aquí</p>
                <p className="ld-drop-sub">o haz clic para explorar · solo .pdf · máx. 15 MB</p>
              </>
            )}
            <input
              ref={inputRef} type="file" accept=".pdf" hidden
              onChange={(e) => elegirArchivo(e.target.files?.[0])}
            />
          </div>

          <div className="ld-campos">
            <label className="ld-campo">Título
              <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Se autocompleta con el nombre del archivo" />
            </label>
            <label className="ld-campo">Autor <span>(opcional)</span>
              <input type="text" value={autor} onChange={(e) => setAutor(e.target.value)} />
            </label>
            <label className="ld-campo">Categoría <span>(opcional)</span>
              <input type="text" value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="General" />
            </label>
          </div>

          {avisoSubida && (
            <div className={`ld-aviso ${avisoSubida.tipo}`}>{avisoSubida.texto}</div>
          )}

          <button type="submit" className="ld-btn-subir" disabled={subiendo || !archivo}>
            <Upload size={16} /> {subiendo ? 'Subiendo...' : 'Subir lectura'}
          </button>
        </form>
      </section>

      <section className="card-section">
        <div className="card-header-blue">
          Historial de lecturas subidas {!cargando && `(${lecturas.length} · ${publicadas} visibles para alumnos)`}
        </div>

        {cargando && <div className="dashboard-empty">Cargando historial...</div>}
        {!cargando && lecturas.length === 0 && !error && (
          <div className="dashboard-empty">Todavía no has subido ninguna lectura.</div>
        )}

        {lecturas.length > 0 && (
          <div className="activity-table-wrapper">
            <table className="activity-table">
              <thead>
                <tr>
                  <th>Título</th><th>Autor / Categoría</th><th>Fecha de subida</th>
                  <th>Estado</th><th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {lecturas.map((l) => (
                  <tr key={l._id}>
                    <td>{l.titulo}</td>
                    <td>{[l.autor, l.categoria].filter(Boolean).join(' · ') || '—'}</td>
                    <td>{formatearFecha(l.createdAt)}</td>
                    <td>
                      <span className={`ld-estado ld-estado-${l.estado === 'Publicado' ? 'pub' : 'arch'}`}>
                        {l.estado}
                      </span>
                    </td>
                    <td className="ld-acciones">
                      <a href={`${API_BASE}${l.pdfUrl}`} target="_blank" rel="noreferrer" title="Ver PDF">
                        <ExternalLink size={16} />
                      </a>
                      <button onClick={() => alternarEstado(l)} title={l.estado === 'Publicado' ? 'Archivar' : 'Publicar'}>
                        {l.estado === 'Publicado' ? <Archive size={16} /> : <RotateCcw size={16} />}
                      </button>
                      <button onClick={() => eliminar(l)} title="Eliminar" className="ld-btn-eliminar">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
