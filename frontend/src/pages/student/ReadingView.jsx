import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { obtenerLibros, subirPdf, cambiarEstadoLibro } from "../../services/bibliotecaService";
import './ReadingView.css';
import './Biblioteca.css';

export default function ReadingView() {
  const [pestanaActiva, setPestanaActiva] = useState('Lectura');
  const [puntos, setPuntos] = useState(0);
  const [lecturaData, setLecturaData] = useState(null);
  const [respuestasSeleccionadas, setRespuestasSeleccionadas] = useState({});
  const [cargando, setCargando] = useState(true);

  // Estados nuevos para la Biblioteca
  const [libros, setLibros] = useState([]);
  const [filtroActivo, setFiltroActivo] = useState('Todos');

  const [mensajesChat, setMensajesChat] = useState([
    { id: 1, emisor: 'bot', texto: '¡Hola! Soy tu asistente de lectura. ¿Tienes alguna duda?' }
  ]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');

  // Carga de la actividad principal
  useEffect(() => {
    const obtenerActividad = async () => {
      try {
        const res = await axios.get('http://localhost:5000/api/evaluacion/actividad-actual');
        setLecturaData(res.data);
      } catch (error) {
        setLecturaData({
          tipo: "Texto argumentativo",
          tiempoEstimado: "5 min",
          titulo: "El tiempo libre y la creatividad",
          parrafos: [
            "En el mundo moderno, el tiempo libre se ha convertido en un bien escaso. Los adolescentes de hoy en día enfrentan una agenda cada vez más cargada: clases, tareas, actividades extracurriculares y compromisos sociales ocupan la mayor parte de sus horas. Sin embargo, numerosos estudios en psicología y neurociencia sugieren que el aburrimiento —esa sensación incómoda de no tener nada que hacer— puede ser, paradójicamente, uno de los estados mentales más productivos para el desarrollo creativo."
          ],
          preguntas: [
            {
              id: 1,
              enunciado: "¿Cuál es la tesis principal del texto?",
              opciones: [
                { id: "A", texto: "Los adolescentes tienen demasiadas actividades extracurriculares." },
                { id: "B", texto: "El aburrimiento puede ser beneficioso para el desarrollo creativo." },
                { id: "C", texto: "La tecnología es perjudicial para la salud mental." },
                { id: "D", texto: "Los neurocientíficos no comprenden cómo funciona el cerebro." }
              ],
              respuestaCorrecta: "B"
            }
          ]
        });
      } finally {
        setCargando(false);
      }
    };

    obtenerActividad();
  }, []);

  // Carga automática de libros al cambiar a la pestaña Biblioteca
  useEffect(() => {
    if (pestanaActiva === 'Biblioteca') {
      cargarBiblioteca();
    }
  }, [pestanaActiva]);

  // Funciones de la Biblioteca
  const cargarBiblioteca = async () => {
    try {
      const data = await obtenerLibros();
      setLibros(data);
    } catch (err) {
      console.error('Error cargando biblioteca:', err);
    }
  };

  const handleSubirArchivo = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await subirPdf(file);
      setPuntos((prev) => Math.min(20, prev + 2)); // Suma 2 puntos opcionales
      cargarBiblioteca();
    } catch (err) {
      console.error('Error al subir PDF:', err);
    }
  };

  const handleCambiarEstado = async (id, estadoActual) => {
    const estados = ['Por leer', 'Leyendo', 'Leído'];
    const siguienteIndice = (estados.indexOf(estadoActual) + 1) % estados.length;
    const nuevoEstado = estados[siguienteIndice];

    try {
      await cambiarEstadoLibro(id, nuevoEstado);
      cargarBiblioteca();
    } catch (err) {
      console.error('Error al actualizar estado:', err);
    }
  };

  const seleccionarOpcion = (preguntaId, opcionId, esCorrecta) => {
    if (respuestasSeleccionadas[preguntaId]) return;

    setRespuestasSeleccionadas((prev) => ({
      ...prev,
      [preguntaId]: opcionId
    }));

    if (opcionId === esCorrecta) {
      setPuntos((prev) => Math.min(20, prev + 5));
    }
  };
const enviarMensajeAsistente = async (e) => {
  e.preventDefault();
  if (!nuevoMensaje.trim()) return;

  const mensajeTexto = nuevoMensaje;
  const mensajeUsuario = { id: Date.now(), emisor: 'user', texto: mensajeTexto };

  setMensajesChat((prev) => [...prev, mensajeUsuario]);
  setNuevoMensaje('');

  try {
    // Une los párrafos para pasarlos como contexto
    const textoCompleto = lecturaData.parrafos ? lecturaData.parrafos.join(' ') : '';

    const res = await axios.post('http://localhost:5000/api/ai/chat', {
      mensaje: mensajeTexto,
      textoLectura: textoCompleto
    });

    setMensajesChat((prev) => [
      ...prev,
      { id: Date.now() + 1, emisor: 'bot', texto: res.data.respuesta }
    ]);
  } catch (error) {
    setMensajesChat((prev) => [
      ...prev,
      { id: Date.now() + 1, emisor: 'bot', texto: 'Ocurrió un error al consultar al asistente.' }
    ]);
  }
};

  if (cargando) return <div className="loading-screen">Cargando lectura...</div>;

  const respondidasCount = Object.keys(respuestasSeleccionadas).length;
  const totalPreguntas = lecturaData?.preguntas?.length || 0;

  const librosFiltrados = libros.filter((l) => {
    if (filtroActivo === 'Todos') return true;
    return l.estado === filtroActivo;
  });

  return (
    <div className="dynamic-background">
      <div className="app-card">
        {/* NAVBAR */}
        <header className="navbar-container">
          <div className="navbar-top">
            <div className="brand-section">
              <span className="brand-icon">📖</span>
              <div>
                <h1 className="brand-title">LecturaActiva</h1>
                <span className="brand-subtitle">4.° Secundaria</span>
              </div>
            </div>

            <div className="score-section">
              <span>🔥</span>
              <span className="score-text">{puntos} pts</span>
              <div className="progress-bar-bg">
                <div 
                  className="progress-bar-fill" 
                  style={{ width: `${(puntos / 20) * 100}%` }}
                ></div>
              </div>
              <span className="score-target">→ 20 pts</span>
              <span>🏆</span>
            </div>

            <div className="user-avatar">ES</div>
          </div>

          <nav className="navbar-bottom">
            {['Lectura', 'Preguntas', 'Vocabulario', 'Asistente', 'Refuerzo', 'Biblioteca'].map((tab) => (
              <button
                key={tab}
                className={`nav-tab ${pestanaActiva === tab ? 'active' : ''}`}
                onClick={() => setPestanaActiva(tab)}
              >
                {tab}
              </button>
            ))}
          </nav>
        </header>

        {/* MAIN CONTAINER */}
        <main className="main-content">
          {/* IZQUIERDA: TEXTO */}
          <section className="reading-pane">
            <div className="tags-container">
              <span className="tag tag-purple">{lecturaData.tipo}</span>
              <span className="tag tag-gray">⏱ {lecturaData.tiempoEstimado}</span>
            </div>

            <h2 className="reading-header">{lecturaData.titulo}</h2>

            <div className="reading-progress-bar">
              <div 
                className="reading-progress-fill"
                style={{ width: `${(respondidasCount / totalPreguntas) * 100}%` }}
              ></div>
            </div>
            <span className="reading-counter">{respondidasCount}/{totalPreguntas}</span>

            <div className="paragraphs-list">
              {lecturaData.parrafos.map((p, index) => (
                <div key={index} className="paragraph-item">
                  <span className="paragraph-number">{index + 1}</span>
                  <p className="paragraph-text">{p}</p>
                </div>
              ))}
            </div>
          </section>

          {/* DERECHA: PANEL DINÁMICO */}
          <section className="questions-pane">
            
            {/* VISTA LECTURA (INICIO) */}
            {pestanaActiva === 'Lectura' && (
              <div className="reading-welcome-container">
                <div className="brain-icon-wrapper">
                  <span className="brain-icon">🧠</span>
                </div>

                <h2 className="welcome-title">¿Listo para empezar?</h2>
                
                <p className="welcome-subtitle">
                  Leé el texto y marcá los párrafos. Luego explorá preguntas, vocabulario y el asistente.
                </p>

                <div className="welcome-buttons-grid">
                  <button className="welcome-btn" onClick={() => setPestanaActiva('Preguntas')}>
                    <span>🔍</span> Preguntas
                  </button>

                  <button className="welcome-btn" onClick={() => setPestanaActiva('Vocabulario')}>
                    <span>⭐</span> Vocabulario
                  </button>

                  <button className="welcome-btn" onClick={() => setPestanaActiva('Asistente')}>
                    <span>💬</span> Asistente
                  </button>

                  <button className="welcome-btn" onClick={() => setPestanaActiva('Refuerzo')}>
                    <span>⚡</span> Refuerzo
                  </button>

                  <button className="welcome-btn" onClick={() => setPestanaActiva('Biblioteca')}>
                    <span>📊</span> Biblioteca
                  </button>
                </div>
              </div>
            )}

            {/* VISTA PREGUNTAS */}
            {pestanaActiva === 'Preguntas' && (
              <>
                <div className="questions-header">
                  <h3>Preguntas de comprensión</h3>
                  <span className="questions-status">{respondidasCount}/{totalPreguntas} respondidas</span>
                </div>

                <div className="questions-scroll-area">
                  {lecturaData.preguntas.map((q) => {
                    const seleccionada = respuestasSeleccionadas[q.id];
                    return (
                      <div key={q.id} className="question-card">
                        <div className="question-title-row">
                          <span className="question-number">{q.id}</span>
                          <p className="question-text">{q.enunciado}</p>
                        </div>

                        <div className="options-list">
                          {q.opciones.map((opcion) => {
                            let estadoClase = "";
                            if (seleccionada) {
                              if (opcion.id === q.respuestaCorrecta) estadoClase = "correct";
                              else if (opcion.id === seleccionada) estadoClase = "incorrect";
                              else estadoClase = "disabled";
                            }

                            return (
                              <button
                                key={opcion.id}
                                className={`option-btn ${estadoClase}`}
                                onClick={() => seleccionarOpcion(q.id, opcion.id, q.respuestaCorrecta)}
                                disabled={!!seleccionada}
                              >
                                <span className="option-badge">{opcion.id}</span>
                                <span className="option-label">{opcion.texto}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* VISTA ASISTENTE */}
            {pestanaActiva === 'Asistente' && (
              <div className="assistant-container">
                <div className="questions-header">
                  <h3>Asistente Virtual IA</h3>
                  <span className="questions-status">En línea</span>
                </div>

                <div className="chat-messages-area">
                  {mensajesChat.map((msg) => (
                    <div key={msg.id} className={`chat-bubble ${msg.emisor}`}>
                      {msg.texto}
                    </div>
                  ))}
                </div>

                <form className="chat-input-form" onSubmit={enviarMensajeAsistente}>
                  <input
                    type="text"
                    placeholder="Haz una pregunta sobre el texto..."
                    value={nuevoMensaje}
                    onChange={(e) => setNuevoMensaje(e.target.value)}
                  />
                  <button type="submit">Enviar</button>
                </form>
              </div>
            )}

            {/* VISTA BIBLIOTECA */}
{pestanaActiva === 'Biblioteca' && (
  <div className="library-container">
    <div className="library-header">
      <h2>Mi biblioteca</h2>
      <span className="library-subtitle">
        {libros.length} libros · Agregar PDF suma <strong>+2 pts</strong>
      </span>

      <div className="library-filters">
        {['Todos', 'Por leer', 'Leyendo', 'Leído'].map((filtro) => (
          <button
            key={filtro}
            className={`filter-btn ${filtroActivo === filtro ? 'active' : ''}`}
            onClick={() => setFiltroActivo(filtro)}
          >
            {filtro}
          </button>
        ))}
      </div>
    </div>

    <div className="upload-dropzone">
      <div className="pdf-icon">📄</div>
      <p className="upload-title">Arrastrá tu PDF aquí</p>
      <p className="upload-subtext">o hacé clic para explorar · solo .pdf</p>
      <input
        type="file"
        accept=".pdf"
        className="file-input-hidden"
        onChange={handleSubirArchivo}
      />
    </div>

    <div className="books-list">
      {librosFiltrados.map((libro) => (
        <div key={libro._id} className="book-card">
          <div className="book-info">
            <span className="book-icon">📖</span>
            <div>
              <h4 className="book-title">{libro.titulo}</h4>
              <p className="book-author">{libro.autor} · {libro.genero}</p>
            </div>
          </div>

          <button
            className={`status-badge status-${libro.estado.toLowerCase().replace(' ', '-')}`}
            onClick={() => handleCambiarEstado(libro._id, libro.estado)}
          >
            {libro.estado}
          </button>
        </div>
      ))}
    </div>
  </div>
)}

            {/* VISTA OTRAS PESTAÑAS */}
            {['Vocabulario', 'Refuerzo'].includes(pestanaActiva) && (
              <div className="tab-placeholder">
                <h3>Sección: {pestanaActiva}</h3>
                <p>Contenido disponible próximamente.</p>
              </div>
            )}

          </section>
        </main>
      </div>
    </div>
  );
}