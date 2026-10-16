import React, { useState, useEffect, useRef, useContext } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { API_BASE_URL } from '../../config';
import { obtenerLibros } from "../../services/bibliotecaService";
import { enviarMensajeChat } from "../../services/aiService";
import { AuthContext } from "../../context/AuthContext";
import { guardarProgreso } from "../../services/progresoService";
import { io } from 'socket.io-client';

import './ReadingView.css';
import './Biblioteca.css';
import './iachat.css';

const API_BASE = API_BASE_URL;
// Configuración del socket: apunta al puerto del backend
const socket = io(API_BASE);

export default function ReadingView() {
  const navigate = useNavigate();
  const { user, logout } = useContext(AuthContext);

  // Parámetros que manda el curso: ?id=<lectura>&curso=<curso>&tab=<pestaña>
  const [searchParams] = useSearchParams();
  const lecturaId = searchParams.get('id');
  const cursoId = searchParams.get('curso');
  const PESTANAS = ['Lectura', 'Preguntas', 'Vocabulario', 'Asistente', 'Refuerzo', 'Biblioteca'];
  const tabParam = searchParams.get('tab');

  // --- Menú desplegable del avatar (config / modo oscuro / cerrar sesión) ---
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [modoOscuro, setModoOscuro] = useState(() => localStorage.getItem('modoOscuro') === 'true');
  const menuRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('modoOscuro', modoOscuro);
  }, [modoOscuro]);

  // Cierra el menú si se hace clic fuera de él
  useEffect(() => {
    const manejarClicFuera = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuAbierto(false);
      }
    };
    document.addEventListener('mousedown', manejarClicFuera);
    return () => document.removeEventListener('mousedown', manejarClicFuera);
  }, []);

  const handleCerrarSesion = () => {
    setMenuAbierto(false);
    logout();
    navigate('/', { replace: true });
  };

  const iniciales = user?.nombre
    ? user.nombre.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
    : 'ES';

  const [pestanaActiva, setPestanaActiva] = useState(PESTANAS.includes(tabParam) ? tabParam : 'Lectura');
  const [puntos, setPuntos] = useState(0);
  const [lecturaData, setLecturaData] = useState(null);
  const RESPUESTAS_KEY = `respuestas_alumno_${user?.id || 'anon'}_${lecturaId || 'actual'}`;
  const [respuestasSeleccionadas, setRespuestasSeleccionadas] = useState(() => {
    const saved = localStorage.getItem(RESPUESTAS_KEY);
    if (saved) {
      try { return JSON.parse(saved); } catch(e) {}
    }
    return {};
  });

  useEffect(() => {
    localStorage.setItem(RESPUESTAS_KEY, JSON.stringify(respuestasSeleccionadas));
  }, [respuestasSeleccionadas]);

  // Al cambiar de lectura se cargan SUS respuestas (no las de otra actividad).
  useEffect(() => {
    try { setRespuestasSeleccionadas(JSON.parse(localStorage.getItem(RESPUESTAS_KEY)) || {}); }
    catch { setRespuestasSeleccionadas({}); }
  }, [RESPUESTAS_KEY]);

  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');

  // Lecturas que subió el profesor (solo lectura para el alumno)
  const [libros, setLibros] = useState([]);
  const [huboLecturaNueva, setHuboLecturaNueva] = useState(false);

  const CHAT_STORAGE_KEY = 'chat_messages_alumno';
  const [mensajesChat, setMensajesChat] = useState(() => {
    const savedChat = localStorage.getItem(CHAT_STORAGE_KEY);
    if (savedChat) {
      try { return JSON.parse(savedChat); } catch(e) {}
    }
    return [
      { id: 1, emisor: 'bot', texto: 'Hola! Soy tu asistente de lectura. Tienes alguna duda?' }
    ];
  });

  useEffect(() => {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(mensajesChat));
  }, [mensajesChat]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');

  // --- Captura de voz para texto literal ---
  const [grabando, setGrabando] = useState(false);
  const [textoLiteralVoz, setTextoLiteralVoz] = useState('');
  const [textoParcial, setTextoParcial] = useState('');
  const [errorVoz, setErrorVoz] = useState('');
  const reconocimientoRef = useRef(null);
  const quiereGrabarRef = useRef(false);

  const [subrayados, setSubrayados] = useState({}); // { [indiceParrafo]: [{ inicio, fin, color }] }
  const [toolbarSubrayado, setToolbarSubrayado] = useState(null);
  const [respuestaInferencial, setRespuestaInferencial] = useState('');
  const [respuestaCritico, setRespuestaCritico] = useState('');

  // Apaga el micrófono si el alumno cambia de pantalla
  useEffect(() => {
    return () => {
      quiereGrabarRef.current = false;
      reconocimientoRef.current?.stop();
    };
  }, []);

  const iniciarReconocimiento = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setErrorVoz('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.');
      return;
    }
    setErrorVoz('');
    quiereGrabarRef.current = true;

    const rec = new SR();
    rec.lang = 'es-PE';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (event) => {
      let finales = '';
      let parcial = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finales += t + ' ';
        else parcial += t;
      }
      if (finales) setTextoLiteralVoz((prev) => `${prev} ${finales}`.trim());
      setTextoParcial(parcial);
    };

    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return; // onend lo reinicia
      quiereGrabarRef.current = false;
      const mensajes = {
        'not-allowed': 'Permiso de micrófono denegado. Actívalo en el candado de la barra de direcciones.',
        'service-not-allowed': 'El navegador bloqueó el reconocimiento de voz.',
        'audio-capture': 'No se detectó ningún micrófono.',
        'network': 'Sin conexión: el reconocimiento de voz necesita internet.',
      };
      setErrorVoz(mensajes[e.error] || `Error de voz: ${e.error}`);
      setGrabando(false);
    };

    rec.onend = () => {
      setTextoParcial('');
      if (quiereGrabarRef.current) {
        try { rec.start(); } catch { /* ya estaba iniciado */ }
      } else {
        setGrabando(false);
      }
    };

    try {
      rec.start();
      reconocimientoRef.current = rec;
      setGrabando(true);
    } catch (err) {
      console.error(err);
      setErrorVoz('No se pudo iniciar la grabación.');
      quiereGrabarRef.current = false;
    }
  };

  const detenerReconocimiento = () => {
    quiereGrabarRef.current = false;
    reconocimientoRef.current?.stop();
    setGrabando(false);
  };

  // --- Subrayado de texto ---
  const calcularOffset = (contenedor, nodo, offsetNodo) => {
    let total = 0, encontrado = false;
    const recorrer = (n) => {
      if (encontrado) return;
      if (n === nodo) { total += offsetNodo; encontrado = true; return; }
      if (n.nodeType === Node.TEXT_NODE) total += n.textContent.length;
      else n.childNodes.forEach(recorrer);
    };
    contenedor.childNodes.forEach(recorrer);
    return total;
  };

  const manejarSeleccionParrafo = (indiceParrafo) => {
    const seleccion = window.getSelection();
    if (!seleccion || seleccion.isCollapsed || seleccion.rangeCount === 0) {
      setToolbarSubrayado(null);
      return;
    }
    const rango = seleccion.getRangeAt(0);
    const contenedor = document.getElementById(`parrafo-texto-${indiceParrafo}`);
    if (!contenedor || !contenedor.contains(rango.commonAncestorContainer)) return;

    const inicio = calcularOffset(contenedor, rango.startContainer, rango.startOffset);
    const fin = calcularOffset(contenedor, rango.endContainer, rango.endOffset);
    if (inicio === fin) return;

    const rect = rango.getBoundingClientRect();
    setToolbarSubrayado({
      x: rect.left + rect.width / 2,
      y: rect.top - 44,
      indiceParrafo,
      inicio: Math.min(inicio, fin),
      fin: Math.max(inicio, fin),
    });
  };

  const aplicarSubrayado = (color) => {
    if (!toolbarSubrayado) return;
    const { indiceParrafo, inicio, fin } = toolbarSubrayado;
    setSubrayados((prev) => {
      const actual = prev[indiceParrafo] || [];
      const sinSolapes = actual.filter((r) => fin <= r.inicio || inicio >= r.fin);
      return {
        ...prev,
        [indiceParrafo]: [...sinSolapes, { inicio, fin, color }].sort((a, b) => a.inicio - b.inicio),
      };
    });
    window.getSelection()?.removeAllRanges();
    setToolbarSubrayado(null);
  };

  const borrarSubrayadosDeParrafo = (indiceParrafo) => {
    setSubrayados((prev) => ({ ...prev, [indiceParrafo]: [] }));
  };

  const renderizarParrafoConSubrayado = (texto, rangos = []) => {
    if (!rangos.length) return texto;
    const partes = [];
    let cursor = 0;
    rangos.forEach((r, i) => {
      if (r.inicio > cursor) partes.push(texto.slice(cursor, r.inicio));
      partes.push(<mark key={i} className={`subrayado subrayado-${r.color}`}>{texto.slice(r.inicio, r.fin)}</mark>);
      cursor = r.fin;
    });
    if (cursor < texto.length) partes.push(texto.slice(cursor));
    return partes;
  };

  // Marca de inicio de la lectura actual: sirve para medir el tiempo real que tarda el alumno
  const inicioLecturaRef = useRef(Date.now());
  const [guardandoProgreso, setGuardandoProgreso] = useState(false);
  const [avisoProgreso, setAvisoProgreso] = useState(null); // { tipo: 'ok' | 'error', texto }
  useEffect(() => { inicioLecturaRef.current = Date.now(); }, [lecturaData?.readingId]);

  // Envía el progreso al backend (POST /api/progreso)
  const enviarProgreso = async () => {
    // /api/evaluacion/actividad-actual devuelve el id como "readingId" (antes se buscaba _id/id y llegaba vacío)
    const readingId = lecturaData?.readingId || lecturaData?._id || lecturaData?.id;
    if (!readingId) {
      setAvisoProgreso({ tipo: 'error', texto: 'No se pudo identificar la lectura. Recarga la página e inténtalo de nuevo.' });
      return;
    }
    setGuardandoProgreso(true);
    setAvisoProgreso(null);
    try {
      // Minutos reales (mínimo 0.1 para evitar divisiones por cero en la eficiencia temporal)
      const tiempoRealMin = Math.max(0.1, Math.round(((Date.now() - inicioLecturaRef.current) / 60000) * 100) / 100);
      const res = await guardarProgreso({
        readingId,
        respuestas: respuestasSeleccionadas, // el servidor calcula los aciertos con las respuestas correctas
        totalPreguntas,
        tiempoEstimadoMin: lecturaData?.tiempoEstimadoMin,
        tiempoRealMin,
        textoLiteral: textoLiteralVoz,
        respuestaInferencial,
        respuestaCritico,
      });
      setAvisoProgreso({ tipo: 'ok', texto: res?.mensaje || 'Progreso guardado.' });

      // Acompañamiento cualitativo (sin números) que devuelve el servidor
      const a = res?.acompañamiento;
      const textos = a ? [a.literal, a.inferencial, a.critico].filter(Boolean) : [];
      if (textos.length) {
        setMensajesChat((prev) => [...prev, ...textos.map((texto, i) => ({ id: Date.now() + i, emisor: 'bot', texto }))]);
      }
    } catch (err) {
      setAvisoProgreso({ tipo: 'error', texto: err.response?.data?.mensaje || 'No se pudo guardar el progreso. Inténtalo de nuevo.' });
    } finally {
      setGuardandoProgreso(false);
    }
  };

  // Carga de la actividad: el texto y las preguntas de la lectura elegida en el curso (?id=).
  // Sin ?id= se mantiene el comportamiento anterior (/evaluacion/actividad-actual).
  const [recarga, setRecarga] = useState(0);
  useEffect(() => {
    const obtenerActividad = async () => {
      const silenciosa = recarga > 0; // recargas por tiempo real: sin pantalla de "Cargando"
      if (!silenciosa) { setCargando(true); setErrorCarga(''); }
      try {
        const res = lecturaId
          ? await api.get(`/biblioteca/${lecturaId}/actividad`)
          : await api.get('/evaluacion/actividad-actual');
        setLecturaData(res.data);
        setErrorCarga('');
      } catch (error) {
        console.error('Error al cargar la lectura:', error);
        if (!silenciosa) {
          setLecturaData(null);
          setErrorCarga(error.response?.data?.mensaje || error.response?.data?.message || 'No se pudo cargar la lectura. Vuelve a iniciar sesión e inténtalo de nuevo.');
        }
      } finally {
        if (!silenciosa) setCargando(false);
      }
    };

    obtenerActividad();
  }, [lecturaId, recarga]);

  // La docente guardó preguntas nuevas en la lectura que el alumno tiene abierta: se recarga sola.
  useEffect(() => {
    const alActualizar = (data) => {
      if (!lecturaId || String(data?.id) === String(lecturaId)) setRecarga((n) => n + 1);
    };
    socket.on('lectura-actualizada', alActualizar);
    return () => { socket.off('lectura-actualizada', alActualizar); };
  }, [lecturaId]);

  // Carga de las lecturas subidas por el profesor. Se hace siempre al entrar
  // (no solo en la pestaña Biblioteca) para poder avisar en el Asistente si hay algo nuevo.
  useEffect(() => {
    cargarBiblioteca();

    // --- ESCUCHA DE SOCKETS PARA ACTUALIZACIÓN FLUIDA ---
    socket.on('nueva-lectura', (nuevaLectura) => {
      console.log('📚 ¡Nueva lectura recibida vía socket!', nuevaLectura);

      // 1. Actualizamos la lista de libros localmente
      setLibros((prev) => [nuevaLectura, ...prev]);

      // 2. Activamos el punto rojo en la pestaña Biblioteca
      setHuboLecturaNueva(true);

      // 3. Enviamos un mensaje al chat del Asistente inmediatamente
      setMensajesChat((prev) => [
        ...prev,
        {
          id: Date.now(),
          emisor: 'bot',
          texto: `📚 ¡Atención! Tu profesor acaba de subir una nueva lectura: “${nuevaLectura.titulo}”. Puedes verla en la pestaña Biblioteca.`,
        },
      ]);
    });

    return () => {
      socket.off('nueva-lectura');
    };
  }, []);

  const cargarBiblioteca = async () => {
    try {
      const data = await obtenerLibros();
      const lista = Array.isArray(data) ? data : [];
      setLibros(lista);
      avisarSiHayLecturaNueva(lista);
    } catch (err) {
      console.error('Error cargando biblioteca:', err);
      setLibros([]);
    }
  };

  // Compara la lectura más reciente subida por el profesor con la última que
  // el alumno ya vio (guardada en localStorage) y, si hay una nueva, la
  // anuncia como mensaje del asistente y marca el indicador en las pestañas.
  const avisarSiHayLecturaNueva = (lista) => {
    if (!lista.length || !user?.id) return;
    const masReciente = lista.reduce((a, b) => (new Date(a.createdAt) > new Date(b.createdAt) ? a : b));
    const clave = `ultimaLecturaVista_${user.id}`;
    const ultimaVista = localStorage.getItem(clave);

    if (ultimaVista !== masReciente._id) {
      setHuboLecturaNueva(true);
      setMensajesChat((prev) => [
        ...prev,
        {
          id: Date.now(),
          emisor: 'bot',
          texto: `📚 Tu profesor subió una nueva lectura: “${masReciente.titulo}”. Puedes verla en la pestaña Biblioteca.`,
        },
      ]);
    }
  };

  // Al abrir la Biblioteca se da por "vista" la lectura más reciente.
  useEffect(() => {
    if (pestanaActiva === 'Biblioteca' && libros.length && user?.id) {
      const masReciente = libros.reduce((a, b) => (new Date(a.createdAt) > new Date(b.createdAt) ? a : b));
      localStorage.setItem(`ultimaLecturaVista_${user.id}`, masReciente._id);
      setHuboLecturaNueva(false);
    }
  }, [pestanaActiva, libros, user?.id]);

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

    const textoUsuario = nuevoMensaje;

    setMensajesChat((prev) => [
      ...prev,
      { id: Date.now(), emisor: 'user', texto: textoUsuario }
    ]);
    setNuevoMensaje('');

    try {
      const res = await enviarMensajeChat(textoUsuario, lecturaData?.titulo);

      setMensajesChat((prev) => [
        ...prev,
        { id: Date.now() + 1, emisor: 'bot', texto: res.respuesta }
      ]);
    } catch (error) {
      console.error('Error al enviar mensaje:', error);
      setMensajesChat((prev) => [
        ...prev,
        { id: Date.now() + 1, emisor: 'bot', texto: 'Error al conectar con la IA.' }
      ]);
    }
  };

  if (cargando) return <div className="loading-screen">Cargando lectura...</div>;
  if (errorCarga) return (
    <div className="loading-screen">
      <p>{errorCarga}</p>
      <button onClick={() => navigate(cursoId ? `/cursos/${cursoId}` : '/cursos')}>Volver al curso</button>
    </div>
  );

  const respondidasCount = Object.keys(respuestasSeleccionadas).length;
  const totalPreguntas = lecturaData?.preguntas?.length || 0;

  // El backend ya filtra por rol: al alumno solo le llegan lecturas 'Publicado'.
  const librosOrdenados = (Array.isArray(libros) ? libros : [])
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const formatearFechaLectura = (fechaISO) => {
    const f = new Date(fechaISO);
    return f.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="dynamic-background">
      <div className={`app-card ${modoOscuro ? 'modo-oscuro' : ''}`}>
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

            <div className="user-menu-wrapper" ref={menuRef}>
              <button
                className="user-avatar"
                onClick={() => setMenuAbierto((prev) => !prev)}
                aria-label="Abrir menú de usuario"
              >
                {iniciales}
              </button>

              {menuAbierto && (
                <div className="user-menu-dropdown">
                  <div className="user-menu-header">
                    <span className="user-menu-name">{user?.nombre || 'Estudiante'}</span>
                    <span className="user-menu-email">{user?.email || ''}</span>
                  </div>

                  <div className="user-menu-divider"></div>

                  <div className="user-menu-item theme-toggle-row">
                    <span>🌙 Modo oscuro</span>
                    <button
                      className={`toggle-switch ${modoOscuro ? 'on' : ''}`}
                      onClick={() => setModoOscuro((prev) => !prev)}
                      aria-label="Activar o desactivar modo oscuro"
                    >
                      <span className="toggle-knob"></span>
                    </button>
                  </div>

                  <div className="user-menu-divider"></div>

                  <button className="user-menu-item" onClick={() => navigate(cursoId ? `/cursos/${cursoId}` : '/cursos')}>
                    📚 {cursoId ? 'Volver al curso' : 'Mis cursos'}
                  </button>

                  <div className="user-menu-divider"></div>

                  <button className="user-menu-item user-menu-logout" onClick={handleCerrarSesion}>
                    🚪 Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>

          <nav className="navbar-bottom">
            {PESTANAS.map((tab) => (
              <button
                key={tab}
                className={`nav-tab ${pestanaActiva === tab ? 'active' : ''}`}
                onClick={() => setPestanaActiva(tab)}
              >
                {tab}
                {tab === 'Biblioteca' && huboLecturaNueva && <span className="nav-tab-dot" title="Nueva lectura de tu profesor" />}
              </button>
            ))}
          </nav>
        </header>

        {/* MAIN CONTAINER */}
        <main className="main-content">
          {pestanaActiva === 'Biblioteca' ? (
            /* VISTA BIBLIOTECA (Carpetas de Aprendizaje y Rúbricas) */
            <div className="library-container" style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
              <div className="library-header" style={{ marginBottom: '25px' }}>
                <h2 style={{ color: '#1e3a8a', fontSize: '1.8rem', marginBottom: '5px' }}>Carpetas del Curso</h2>
                <span className="library-subtitle" style={{ color: '#64748b' }}>
                  {librosOrdenados.length} actividades disponibles
                </span>
              </div>

              {librosOrdenados.length === 0 && (
                <p className="library-empty" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Tu profesor todavía no ha subido materiales.</p>
              )}

              <div className="books-list" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {Object.entries(
                  librosOrdenados.reduce((acc, libro) => {
                    const s = libro.sesion || 'Sesión 1';
                    if (!acc[s]) acc[s] = [];
                    acc[s].push(libro);
                    return acc;
                  }, {})
                ).sort(([a], [b]) => a.localeCompare(b)).map(([sesion, librosSesion]) => (
                  <div key={sesion} style={{ border: '1px solid #dee2e6', borderRadius: '8px', backgroundColor: '#fff', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ backgroundColor: '#f8f9fa', padding: '15px 20px', borderBottom: '1px solid #dee2e6', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '1.4rem' }}>📁</span>
                      <strong style={{ color: '#0f6cbf', fontSize: '1.2rem' }}>{sesion}</strong>
                    </div>
                    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      {librosSesion.map(libro => (
                        <div key={libro._id} style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '15px', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: '#fcfcfc' }}>
                          <a
                            className="book-card"
                            href={`${API_BASE_URL}${libro.pdfUrl}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ margin: 0, border: 'none', boxShadow: 'none', padding: 0, backgroundColor: 'transparent' }}
                          >
                            <div className="book-info">
                              <span className="book-icon" style={{ fontSize: '1.5rem' }}>📄</span>
                              <div>
                                <h4 className="book-title" style={{ color: '#334155', margin: '0 0 4px 0', fontSize: '1.05rem' }}>{libro.titulo}</h4>
                                <p className="book-author" style={{ color: '#64748b', margin: 0, fontSize: '0.85rem' }}>Material de lectura</p>
                              </div>
                            </div>
                          </a>

                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          ) : (
            <div className="reading-layout">
              {/* IZQUIERDA: TEXTO */}
              <section className="reading-pane">
                <div className="tags-container">
                  <span className="tag tag-purple">{lecturaData?.tipo || "Lectura"}</span>
                  <span className="tag tag-gray">⏱ {lecturaData?.tiempoEstimado || "N/A"}</span>
                </div>

                <h2 className="reading-header">{lecturaData?.titulo || "Sin título"}</h2>

                <div className="reading-progress-bar">
                  <div
                    className="reading-progress-fill"
                    style={{ width: `${totalPreguntas > 0 ? (respondidasCount / totalPreguntas) * 100 : 0}%` }}
                  ></div>
                </div>
                <span className="reading-counter">{respondidasCount}/{totalPreguntas}</span>

                <div className="subrayado-leyenda">
                  <span><i className="subrayado-muestra subrayado-amarillo"></i> Idea principal</span>
                  <span><i className="subrayado-muestra subrayado-verde"></i> Idea secundaria</span>
                  <span><i className="subrayado-muestra subrayado-celeste"></i> Dato clave</span>
                  <span className="subrayado-ayuda">Selecciona texto para subrayarlo</span>
                </div>

                <div className="paragraphs-list">
                  {(lecturaData?.parrafos?.length ? lecturaData.parrafos : null)?.map((p, index) => (
                    <div key={index} className="paragraph-item">
                      <span className="paragraph-number">{index + 1}</span>
                      <p
                        id={`parrafo-texto-${index}`}
                        className="paragraph-text"
                        onMouseUp={() => manejarSeleccionParrafo(index)}
                      >
                        {renderizarParrafoConSubrayado(p, subrayados[index])}
                      </p>
                      {subrayados[index]?.length > 0 && (
                        <button className="borrar-subrayado-btn" onClick={() => borrarSubrayadosDeParrafo(index)}>
                          Borrar subrayado
                        </button>
                      )}
                    </div>
                  )) || <p className="nivel-hint">Esta lectura todavía no tiene texto disponible. Avísale a tu docente para que vuelva a subir el PDF.</p>}
                </div>

                {toolbarSubrayado && (
                  <div className="toolbar-subrayado" style={{ left: toolbarSubrayado.x, top: toolbarSubrayado.y }}>
                    <button className="color-amarillo" onClick={() => aplicarSubrayado('amarillo')} title="Idea principal" />
                    <button className="color-verde" onClick={() => aplicarSubrayado('verde')} title="Idea secundaria" />
                    <button className="color-celeste" onClick={() => aplicarSubrayado('celeste')} title="Dato clave" />
                  </div>
                )}

                {/* Botón de captura de voz y visualización del texto transcrito */}
                <div className="voice-capture-container">
                  <button
                    type="button"
                    className={`btn-grabar ${grabando ? 'activo' : ''}`}
                    onClick={grabando ? detenerReconocimiento : iniciarReconocimiento}
                  >
                    <span className="btn-grabar-icono">{grabando ? '⏹' : '🎙'}</span>
                    {grabando ? 'Detener grabación' : 'Iniciar grabación'}
                  </button>

                  {errorVoz && <p className="voz-error">{errorVoz}</p>}

                  {(textoLiteralVoz || textoParcial) && (
                    <div className="transcript">
                      <strong>Texto capturado:</strong>
                      <p>
                        {textoLiteralVoz} <span className="transcript-parcial">{textoParcial}</span>
                      </p>
                      {textoLiteralVoz && !grabando && (
                        <button type="button" className="btn-limpiar-voz" onClick={() => setTextoLiteralVoz('')}>
                          Borrar texto
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* DERECHA: PANEL DINÁMICO */}
              <section className="questions-pane">
                {/* VISTA LECTURA */}
                {pestanaActiva === 'Lectura' && (
                  <div className="reading-welcome-container">
                    <div className="brain-icon-wrapper">
                      <span className="brain-icon">🧠</span>
                    </div>

                    <h2 className="welcome-title">¿Listo para empezar?</h2>

                    <p className="welcome-subtitle">
                      Lee el texto y marca los párrafos. Luego explora preguntas, vocabulario y el asistente.
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

                    {totalPreguntas === 0 && (
                      <p className="nivel-hint" style={{ padding: '0 4px' }}>
                        Tu docente aún no agregó preguntas de opción múltiple a esta actividad.
                      </p>
                    )}
                    <div className="questions-scroll-area">
                      {lecturaData?.preguntas?.map((q) => {
                        const seleccionada = respuestasSeleccionadas[q.id];
                        return (
                          <div key={q.id} className="question-card">
                            <div className="question-title-row">
                              <span className="question-number">{q.id}</span>
                              <p className="question-text">{q.enunciado}</p>
                            </div>

                            <div className="options-list">
                              {q.opciones?.map((opcion) => {
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

                    <div className="niveles-comprension">
                      <div className="nivel-card">
                        <h4>📖 Nivel literal</h4>
                        <p className="nivel-enunciado">{lecturaData?.preguntaLiteral?.enunciado}</p>
                        {textoLiteralVoz ? (
                          <p className="nivel-respuesta-capturada">"{textoLiteralVoz}"</p>
                        ) : (
                          <p className="nivel-hint">Usa "Iniciar grabación" en el texto para responder esto en voz alta.</p>
                        )}
                      </div>
                      <div className="nivel-card">
                        <h4>🔎 Nivel inferencial</h4>
                        <p className="nivel-enunciado">{lecturaData?.preguntaInferencial?.enunciado}</p>
                        <textarea className="nivel-textarea" placeholder="Escribe tu respuesta..."
                          value={respuestaInferencial} onChange={(e) => setRespuestaInferencial(e.target.value)} />
                      </div>
                      <div className="nivel-card">
                        <h4>💡 Nivel crítico</h4>
                        <p className="nivel-enunciado">{lecturaData?.preguntaCritico?.enunciado}</p>
                        <textarea className="nivel-textarea" placeholder="Escribe tu respuesta..."
                          value={respuestaCritico} onChange={(e) => setRespuestaCritico(e.target.value)} />
                      </div>
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

                    {/* Botón para enviar progreso al finalizar */}
                    <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                      <button
                        className="submit-progress-btn"
                        onClick={enviarProgreso}
                        disabled={respondidasCount === 0 || guardandoProgreso}
                        style={{ padding: '0.6rem 1.2rem', cursor: 'pointer' }}
                      >
                        {guardandoProgreso ? 'Guardando…' : 'Guardar progreso'}
                      </button>
                      {avisoProgreso && (
                        <p role="status" style={{ marginTop: '0.5rem', color: avisoProgreso.tipo === 'ok' ? '#15803d' : '#b91c1c' }}>
                          {avisoProgreso.texto}
                        </p>
                      )}
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

                {/* VISTA OTRAS PESTAÑAS */}
                {['Vocabulario', 'Refuerzo'].includes(pestanaActiva) && (
                  <div className="tab-placeholder">
                    <h3>Sección: {pestanaActiva}</h3>
                    <p>Contenido disponible próximamente.</p>
                  </div>
                )}
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
