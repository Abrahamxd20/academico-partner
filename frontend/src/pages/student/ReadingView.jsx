import React, { useState, useEffect, useRef, useContext } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { API_BASE_URL } from '../../config';
import { obtenerLibros } from "../../services/bibliotecaService";
import { enviarMensajeChat } from "../../services/aiService";
import { AuthContext } from "../../context/AuthContext";
import { guardarProgreso, guardarBorrador, obtenerBorrador } from "../../services/progresoService";
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
  const actividadId = searchParams.get('actividad');
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
  const alumnoKey = user?._id || user?.id || 'alumno';
  const RESULTADOS_KEY = `resultados_alumno_${alumnoKey}_${lecturaId || 'actual'}`;
  const REINTENTOS_KEY = `reintentos_alumno_${alumnoKey}_${lecturaId || 'actual'}`;
  const leerLocal = (key) => { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } };
  const [resultadosPreguntas, setResultadosPreguntas] = useState(() => leerLocal(RESULTADOS_KEY));
  const [mensajesPreguntas, setMensajesPreguntas] = useState({});
  const [preguntaPendiente, setPreguntaPendiente] = useState(null);
  const [reintentosPorPregunta, setReintentosPorPregunta] = useState(() => leerLocal(REINTENTOS_KEY));
  const [reintentoPendiente, setReintentoPendiente] = useState(null);
  const [lecturaData, setLecturaData] = useState(null);
  const RESPUESTAS_KEY = `respuestas_alumno_${alumnoKey}_${lecturaId || 'actual'}`;
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

  useEffect(() => { localStorage.setItem(RESULTADOS_KEY, JSON.stringify(resultadosPreguntas)); }, [RESULTADOS_KEY, resultadosPreguntas]);
  useEffect(() => { localStorage.setItem(REINTENTOS_KEY, JSON.stringify(reintentosPorPregunta)); }, [REINTENTOS_KEY, reintentosPorPregunta]);

  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');

  // Lecturas que subió el profesor (solo lectura para el alumno)
  const [libros, setLibros] = useState([]);
  const [huboLecturaNueva, setHuboLecturaNueva] = useState(false);

  const CHAT_STORAGE_KEY = `chat_messages_alumno_${alumnoKey}_${lecturaId || 'actual'}`;
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
  const [vocabulario, setVocabulario] = useState([]);
  const vocabularioKey = `vocabulario_${user?._id || user?.id || 'alumno'}_${lecturaId || lecturaData?.readingId || lecturaData?._id || 'actual'}`;
  const [retroalimentacionTexto, setRetroalimentacionTexto] = useState('');
  const [generandoRetroalimentacion, setGenerandoRetroalimentacion] = useState(false);
  const [errorRetroalimentacion, setErrorRetroalimentacion] = useState('');
  const [respuestaInferencial, setRespuestaInferencial] = useState('');
  const [respuestaCritico, setRespuestaCritico] = useState('');
  const [borradorCargadoId, setBorradorCargadoId] = useState('');
  const [actividadCurso, setActividadCurso] = useState(null);
  const [respuestaEvidencia, setRespuestaEvidencia] = useState('');
  const [entregasEvidencia, setEntregasEvidencia] = useState([]);
  const [enviandoEvidencia, setEnviandoEvidencia] = useState(false);
  const [errorEvidencia, setErrorEvidencia] = useState('');

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

  useEffect(() => {
    try {
      const guardado = JSON.parse(localStorage.getItem(vocabularioKey) || '[]');
      setVocabulario(Array.isArray(guardado) ? guardado : []);
      const marcasGuardadas = JSON.parse(localStorage.getItem(`${vocabularioKey}_subrayados`) || '{}');
      setSubrayados(marcasGuardadas && typeof marcasGuardadas === 'object' ? marcasGuardadas : {});
    } catch {
      setVocabulario([]);
      setSubrayados({});
    }
  }, [vocabularioKey]);

  const actualizarVocabulario = (siguiente) => {
    setVocabulario(siguiente);
    localStorage.setItem(vocabularioKey, JSON.stringify(siguiente));
  };

  const aplicarSubrayado = (color) => {
    if (!toolbarSubrayado) return;
    const { indiceParrafo, inicio, fin } = toolbarSubrayado;
    const textoSeleccionado = lecturaData?.parrafos?.[indiceParrafo]?.slice(inicio, fin)?.trim()
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    setSubrayados((prev) => {
      const actual = prev[indiceParrafo] || [];
      const sinSolapes = actual.filter((r) => fin <= r.inicio || inicio >= r.fin);
      const siguiente = {
        ...prev,
        [indiceParrafo]: [...sinSolapes, { inicio, fin, color }].sort((a, b) => a.inicio - b.inicio),
      };
      localStorage.setItem(`${vocabularioKey}_subrayados`, JSON.stringify(siguiente));
      return siguiente;
    });
    if (color === 'vocabulario' && textoSeleccionado) {
      const clave = textoSeleccionado.toLocaleLowerCase();
      if (!vocabulario.some((item) => item.palabra.toLocaleLowerCase() === clave)) {
        actualizarVocabulario([...vocabulario, { palabra: textoSeleccionado, definicion: '', consultando: false }]);
      }
      setPestanaActiva('Vocabulario');
    }
    window.getSelection()?.removeAllRanges();
    setToolbarSubrayado(null);
  };

  const consultarPalabra = async (palabra) => {
    actualizarVocabulario(vocabulario.map((item) => item.palabra === palabra ? { ...item, consultando: true, error: '' } : item));
    try {
      const resultado = await enviarMensajeChat(
        `Explica «${palabra}» con palabras sencillas y relaciónala brevemente con esta lectura. Da dos ejemplos cortos y claros. Responde en pocas líneas, de forma amena para secundaria. No hagas preguntas ni termines invitando a seguir conversando.`,
        lecturaData?.titulo,
        'vocabulario'
      );
      actualizarVocabulario(vocabulario.map((item) => item.palabra === palabra
        ? { ...item, definicion: resultado.respuesta || 'No se recibió una explicación.', consultando: false, error: '' }
        : item));
    } catch (error) {
      actualizarVocabulario(vocabulario.map((item) => item.palabra === palabra
        ? { ...item, consultando: false, error: error.response?.data?.respuesta || 'No se pudo consultar la IA. Inténtalo de nuevo.' }
        : item));
    }
  };

  const quitarPalabraVocabulario = (palabra) => actualizarVocabulario(vocabulario.filter((item) => item.palabra !== palabra));

  const generarRetroalimentacion = async () => {
    setGenerandoRetroalimentacion(true);
    setErrorRetroalimentacion('');
    try {
      const texto = [lecturaData?.titulo, ...(lecturaData?.parrafos || [])].filter(Boolean).join('\n').slice(0, 12000);
      const resultado = await enviarMensajeChat(
        'Genera una retroalimentación breve y dinámica sobre esta lectura para un alumno de secundaria. Incluye: idea principal, un aspecto interesante del texto y una recomendación concreta para comprenderlo mejor. Basa todo solo en el texto proporcionado. Usa lenguaje sencillo y no termines con preguntas ni invitaciones.',
        texto || lecturaData?.titulo,
        'retroalimentacion'
      );
      setRetroalimentacionTexto(resultado.respuesta || 'No se recibió retroalimentación. Inténtalo de nuevo.');
    } catch (error) {
      setErrorRetroalimentacion(error.response?.data?.respuesta || 'No se pudo generar la retroalimentación. Inténtalo de nuevo.');
    } finally {
      setGenerandoRetroalimentacion(false);
    }
  };

  const borrarSubrayadosDeParrafo = (indiceParrafo) => {
    setSubrayados((prev) => {
      const siguiente = { ...prev, [indiceParrafo]: [] };
      localStorage.setItem(`${vocabularioKey}_subrayados`, JSON.stringify(siguiente));
      return siguiente;
    });
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
      if (!textoLiteralVoz.trim() || !respuestaInferencial.trim() || !respuestaCritico.trim() || respondidasCount < totalPreguntas) {
        setAvisoProgreso({ tipo: 'error', texto: 'Completa las preguntas y las respuestas literal, inferencial y crítica antes de finalizar.' });
        return;
      }
      // Minutos reales (mínimo 0.1 para evitar divisiones por cero en la eficiencia temporal)
      const tiempoRealMin = Math.max(0.1, Math.round(((Date.now() - inicioLecturaRef.current) / 60000) * 100) / 100);
      const res = await guardarProgreso({
        readingId,
        cursoId,
        actividadId,
        respuestas: respuestasSeleccionadas, // el servidor calcula los aciertos con las respuestas correctas
        totalPreguntas,
        tiempoEstimadoMin: lecturaData?.tiempoEstimadoMin,
        tiempoRealMin,
        textoLiteral: textoLiteralVoz,
        respuestaInferencial,
        respuestaCritico,
        subrayados,
        vocabulario,
        mensajesChat,
        retroalimentacionTexto,
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

  const guardarAvance = async () => {
    const readingId = lecturaData?.readingId || lecturaData?._id || lecturaData?.id;
    if (!readingId) return;
    setGuardandoProgreso(true);
    setAvisoProgreso(null);
    try {
      const tiempoSeg = Math.max(0, Math.round((Date.now() - inicioLecturaRef.current) / 1000));
      await guardarBorrador(readingId, {
        respuestas: respuestasSeleccionadas, textoLiteral: textoLiteralVoz,
        respuestaInferencial, respuestaCritico, subrayados, vocabulario,
        mensajesChat, retroalimentacionTexto, seccionActual: pestanaActiva, tiempoSeg,
      });
      setAvisoProgreso({ tipo: 'ok', texto: 'Tu progreso quedó guardado. Puedes continuar después.' });
    } catch (err) {
      setAvisoProgreso({ tipo: 'error', texto: err.response?.data?.mensaje || 'No se pudo guardar el progreso.' });
    } finally { setGuardandoProgreso(false); }
  };

  // Carga de la actividad: con el token del usuario y la lectura elegida en el curso (?id=)
  useEffect(() => {
    const obtenerActividad = async () => {
      setCargando(true);
      setErrorCarga('');
      try {
        const res = await api.get('/evaluacion/actividad-actual', { params: lecturaId ? { id: lecturaId, cursoId, actividadId } : {} });
        setLecturaData(res.data);
      } catch (error) {
        console.error('Error al cargar la lectura:', error);
        setLecturaData(null);
        setErrorCarga(error.response?.data?.mensaje || error.response?.data?.message || 'No se pudo cargar la lectura. Vuelve a iniciar sesión e inténtalo de nuevo.');
      } finally {
        setCargando(false);
      }
    };

    obtenerActividad();
  }, [lecturaId, cursoId, actividadId]);

  useEffect(() => {
    let vigente = true;
    if (!cursoId || !actividadId) { setActividadCurso(null); setEntregasEvidencia([]); return () => { vigente = false; }; }
    Promise.all([api.get(`/cursos/${cursoId}`), api.get(`/cursos/${cursoId}/evidencias/${actividadId}/mias`)]).then(([cursoRes, entregasRes]) => {
      if (!vigente) return;
      const sesion = (cursoRes.data.sesiones || []).find((s) => (s.actividades || []).some((a) => a._id === actividadId));
      const actividad = sesion?.actividades?.find((a) => a._id === actividadId);
      setActividadCurso(actividad ? {
        ...actividad, objetivoSesion: sesion.objetivoAprendizaje, temaSesion: sesion.temas,
        cursoNombre: cursoRes.data.nombre, grado: cursoRes.data.grado, institucion: cursoRes.data.institucion,
        areaCurricular: cursoRes.data.areaCurricular, referenciaCurricular: cursoRes.data.referenciaCurricular,
        competencias: cursoRes.data.competencias || [], programacionCurricular: cursoRes.data.programacionCurricular,
      } : null);
      setEntregasEvidencia(entregasRes.data.entregas || []);
    }).catch((e) => { if (vigente) console.warn('No se pudo cargar la actividad asignada:', e.message); });
    return () => { vigente = false; };
  }, [cursoId, actividadId]);

  const enviarEvidencia = async () => {
    if (!respuestaEvidencia.trim()) return setErrorEvidencia('Escribe tu evidencia antes de enviarla.');
    setEnviandoEvidencia(true); setErrorEvidencia('');
    try {
      const cursoRes = await api.get(`/cursos/${cursoId}`);
      const sesion = (cursoRes.data.sesiones || []).find((s) => (s.actividades || []).some((a) => a._id === actividadId));
      if (!sesion) throw new Error('No se encontró la sesión de esta actividad. Regresa al curso e inténtalo de nuevo.');
      const { data } = await api.post(`/cursos/${cursoId}/sesiones/${sesion._id}/actividades/${actividadId}/evidencias`, { respuesta: respuestaEvidencia.trim() });
      setEntregasEvidencia((prev) => [data.entrega, ...prev]);
      setRespuestaEvidencia('');
    } catch (e) { setErrorEvidencia(e.response?.data?.message || e.message || 'No se pudo enviar tu evidencia.'); }
    finally { setEnviandoEvidencia(false); }
  };

  useEffect(() => {
    const readingId = lecturaData?.readingId;
    if (!readingId) return;
    Promise.all([
      api.get('/evaluacion/reintentos', { params: { readingId, cursoId, actividadId } }),
      api.get('/evaluacion/intentos', { params: { readingId, cursoId, actividadId } }),
    ]).then(([reintentosRes, intentosRes]) => {
        const intentos = intentosRes.data.intentos || [];
        const guardadas = Object.fromEntries(intentos.map((intento) => [intento.questionId, intento.opcionId]));
        const resultados = Object.fromEntries(intentos.map((intento) => [intento.questionId, intento.correcta]));
        setRespuestasSeleccionadas((prev) => ({ ...prev, ...guardadas }));
        setResultadosPreguntas((prev) => ({ ...prev, ...resultados }));
        const data = reintentosRes.data;
        const agrupados = (data.reintentos || []).reduce((acc, reintento) => {
          (acc[reintento.preguntaOrigenId] ||= []).push(reintento);
          return acc;
        }, {});
        setReintentosPorPregunta(agrupados);
        const dominados = new Set(intentos.filter((intento) => intento.correcta).map((intento) => intento.questionId));
        (data.reintentos || []).filter((reintento) => reintento.correcta).forEach((reintento) => dominados.add(reintento.preguntaOrigenId));
        setPuntos(Math.min(20, dominados.size * 5));
      })
      .catch(() => {});
  }, [lecturaData?.readingId, cursoId, actividadId]);

  useEffect(() => {
    const readingId = lecturaData?.readingId || lecturaData?._id || lecturaData?.id;
    if (!readingId || String(readingId) === borradorCargadoId) return;
    let activo = true;
    obtenerBorrador(readingId).then(({ borrador, yaEnviado }) => {
      if (!activo) return;
      if (yaEnviado) setAvisoProgreso({ tipo: 'ok', texto: 'Esta evaluación ya fue enviada.' });
      if (borrador) {
        setRespuestasSeleccionadas(borrador.respuestas || {});
        setTextoLiteralVoz(borrador.textoLiteral || '');
        setRespuestaInferencial(borrador.respuestaInferencial || '');
        setRespuestaCritico(borrador.respuestaCritico || '');
        setSubrayados(borrador.subrayados || {});
        setVocabulario(borrador.vocabulario || []);
        setMensajesChat(borrador.mensajesChat?.length ? borrador.mensajesChat : mensajesChat);
        setRetroalimentacionTexto(borrador.retroalimentacionTexto || '');
        if (borrador.seccionActual && PESTANAS.includes(borrador.seccionActual)) setPestanaActiva(borrador.seccionActual);
        if (borrador.tiempoSeg) inicioLecturaRef.current = Date.now() - borrador.tiempoSeg * 1000;
      }
    }).catch((err) => console.error('No se pudo recuperar el progreso:', err))
      .finally(() => { if (activo) setBorradorCargadoId(String(readingId)); });
    return () => { activo = false; };
  }, [lecturaData, borradorCargadoId]);

  // Si el docente edita las preguntas de la lectura que el alumno tiene abierta,
  // vuelve a consultar la actividad para reflejar el cambio sin recargar la página.
  useEffect(() => {
    if (!lecturaId) return undefined;

    const actualizarLecturaAbierta = async ({ id } = {}) => {
      if (String(id) !== String(lecturaId)) return;
      try {
        const res = await api.get('/evaluacion/actividad-actual', { params: { id: lecturaId, cursoId, actividadId } });
        setLecturaData(res.data);
      } catch (error) {
        console.error('No se pudo actualizar la lectura:', error);
      }
    };

    socket.on('lectura-actualizada', actualizarLecturaAbierta);
    return () => socket.off('lectura-actualizada', actualizarLecturaAbierta);
  }, [lecturaId, cursoId, actividadId]);

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

  const seleccionarOpcion = async (preguntaId, opcionId) => {
    if (respuestasSeleccionadas[preguntaId] || preguntaPendiente === preguntaId) return;
    const readingId = lecturaData?.readingId || lecturaData?._id || lecturaData?.id;
    setPreguntaPendiente(preguntaId);
    setAvisoProgreso(null);
    try {
      const res = await api.post('/evaluacion/responder', { readingId, questionId: preguntaId, opcionId, cursoId, actividadId });
      setRespuestasSeleccionadas((prev) => ({ ...prev, [preguntaId]: opcionId }));
      setResultadosPreguntas((prev) => ({ ...prev, [preguntaId]: res.data.correcta }));
      setMensajesPreguntas((prev) => ({ ...prev, [preguntaId]: res.data.retroalimentacion }));
      if (res.data.correcta) setPuntos((prev) => Math.min(20, prev + 5));
    } catch (error) {
      setAvisoProgreso({ tipo: 'error', texto: error.response?.data?.mensaje || 'No se pudo revisar tu respuesta. Inténtalo de nuevo.' });
    } finally {
      setPreguntaPendiente(null);
    }
  };

  const pedirPistaParaReintentar = async (pregunta) => {
    const lecturaActual = lecturaData?.readingId || lecturaData?._id;
    if (!lecturaActual || reintentoPendiente === pregunta.id) return;
    const listaActual = reintentosPorPregunta[pregunta.id] || [];
    if (listaActual.length >= 3 || (listaActual.length && !listaActual[listaActual.length - 1].respondidaEn)) return;
    setReintentoPendiente(pregunta.id);
    try {
      const { data } = await api.post('/evaluacion/reintentos', { readingId: lecturaActual, questionId: pregunta.id, cursoId, actividadId });
      setReintentosPorPregunta((prev) => ({ ...prev, [pregunta.id]: [...(prev[pregunta.id] || []), data.reintento] }));
      setMensajesChat((prev) => [...prev, { id: Date.now(), emisor: 'bot', texto: `Pista para ${pregunta.nivel || 'esta'} comprensión: ${data.reintento.pista}` }]);
    } catch (error) {
      setAvisoProgreso({ tipo: 'error', texto: error.response?.data?.mensaje || 'No pude preparar otra pregunta. Inténtalo otra vez.' });
    } finally {
      setReintentoPendiente(null);
    }
  };

  const responderReintento = async (reintento, opcionId) => {
    if (reintento.respondidaEn || reintentoPendiente === String(reintento._id)) return;
    setReintentoPendiente(String(reintento._id));
    try {
      const { data } = await api.post(`/evaluacion/reintentos/${reintento._id}/responder`, { opcionId, cursoId, actividadId });
      const respondido = { ...reintento, opcionElegida: opcionId, correcta: data.correcta, respondidaEn: new Date().toISOString() };
      setReintentosPorPregunta((prev) => ({
        ...prev,
        [reintento.preguntaOrigenId]: (prev[reintento.preguntaOrigenId] || []).map((item) => item._id === reintento._id ? respondido : item),
      }));
      if (data.correcta) setPuntos((prev) => Math.min(20, prev + 5));
      setMensajesChat((prev) => [...prev, { id: Date.now(), emisor: 'bot', texto: data.retroalimentacion || (data.correcta ? '¡Bien hecho!' : 'Revisa la pista e inténtalo con otra pregunta.') }]);
    } catch (error) {
      setAvisoProgreso({ tipo: 'error', texto: error.response?.data?.mensaje || 'No se pudo guardar este intento.' });
    } finally {
      setReintentoPendiente(null);
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
      const contextoLectura = [lecturaData?.titulo, ...(lecturaData?.parrafos || [])].filter(Boolean).join('\n').slice(0, 12000);
      const contextoPedagogico = actividadCurso ? {
        objetivo: actividadCurso.objetivoAprendizaje || actividadCurso.objetivoSesion || actividadCurso.temaSesion || '',
        etapa: actividadCurso.etapa,
        evidencia: actividadCurso.tipoEvidencia,
        instrucciones: actividadCurso.instrucciones,
        curso: actividadCurso.cursoNombre,
        grado: actividadCurso.grado,
        institucion: actividadCurso.institucion,
        areaCurricular: actividadCurso.areaCurricular,
        referenciaCurricular: actividadCurso.referenciaCurricular,
        competencias: actividadCurso.competencias,
        programacionCurricular: actividadCurso.programacionCurricular,
        intentosFallidos: Object.values(resultadosPreguntas).filter((correcta) => correcta === false).length,
      } : null;
      const res = await enviarMensajeChat(textoUsuario, contextoLectura, 'tutoria', mensajesChat.slice(-10), contextoPedagogico);

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
                  <span><i className="subrayado-muestra subrayado-vocabulario"></i> Palabra que no entiendo</span>
                  <span className="subrayado-ayuda">Selecciona texto para subrayarlo</span>
                </div>

                <div className="paragraphs-list">
                  {lecturaData?.parrafos?.map((p, index) => (
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
                  )) || <p>No hay párrafos disponibles.</p>}
                </div>

                {toolbarSubrayado && (
                  <div className="toolbar-subrayado" style={{ left: toolbarSubrayado.x, top: toolbarSubrayado.y }}>
                    <button className="color-amarillo" onClick={() => aplicarSubrayado('amarillo')} title="Idea principal" />
                    <button className="color-verde" onClick={() => aplicarSubrayado('verde')} title="Idea secundaria" />
                    <button className="color-celeste" onClick={() => aplicarSubrayado('celeste')} title="Dato clave" />
                    <button className="color-vocabulario" onClick={() => aplicarSubrayado('vocabulario')} title="No entiendo esta palabra · agregar al vocabulario" />
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
                    <div style={{ marginTop: 16, textAlign: 'center' }}>
                      <button className="submit-progress-btn" onClick={guardarAvance} disabled={guardandoProgreso}>{guardandoProgreso ? 'Guardando…' : 'Guardar progreso'}</button>
                    </div>
                    {avisoProgreso && <p role="status" style={{ textAlign: 'center', color: avisoProgreso.tipo === 'ok' ? '#15803d' : '#b91c1c' }}>{avisoProgreso.texto}</p>}
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
                      {lecturaData?.preguntas?.map((q) => {
                        const seleccionada = respuestasSeleccionadas[q.id];
                        const reintentos = reintentosPorPregunta[q.id] || [];
                        const ultimoReintento = reintentos[reintentos.length - 1];
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
                                  if (opcion.id === seleccionada && resultadosPreguntas[q.id] === true) estadoClase = "correct";
                                  else if (opcion.id === seleccionada && resultadosPreguntas[q.id] === false) estadoClase = "incorrect";
                                  else estadoClase = "disabled";
                                }

                                return (
                                  <button
                                    key={opcion.id}
                                    className={`option-btn ${estadoClase}`}
                                    onClick={() => seleccionarOpcion(q.id, opcion.id)}
                                    disabled={!!seleccionada || preguntaPendiente === q.id}
                                  >
                                    <span className="option-badge">{opcion.id}</span>
                                    <span className="option-label">{opcion.texto}</span>
                                  </button>
                                );
                              })}
                            </div>
                            {preguntaPendiente === q.id && <p role="status" className="nivel-hint">Revisando tu respuesta…</p>}
                            {mensajesPreguntas[q.id] && <p role="status" className="nivel-hint">{mensajesPreguntas[q.id]}</p>}
                            {seleccionada && resultadosPreguntas[q.id] === false && (
                              <div style={{ marginTop: 10 }}>
                                <p className="nivel-hint">Esta alternativa no coincide con la lectura. Puedes recibir una pista y probar otra pregunta del mismo nivel.</p>
                                {(!ultimoReintento || ultimoReintento.respondidaEn) && reintentos.length < 3 && (
                                  <button className="submit-progress-btn" onClick={() => pedirPistaParaReintentar(q)} disabled={reintentoPendiente === q.id}>
                                    {reintentoPendiente === q.id ? 'Preparando pregunta…' : (reintentos.length ? 'Probar otra pregunta' : 'Pedir pista y reintentar')}
                                  </button>
                                )}
                                {reintentos.map((reintento) => (
                                  <div key={reintento._id} className="question-card" style={{ marginTop: 12, borderColor: '#c7d2fe' }}>
                                    <p className="nivel-hint"><strong>Pista:</strong> {reintento.pista}</p>
                                    <p className="question-text">{reintento.enunciado}</p>
                                    <div className="options-list">
                                      {reintento.opciones?.map((opcion) => {
                                        const marcada = reintento.opcionElegida === opcion.id;
                                        const clase = marcada ? (reintento.correcta === true ? 'correct' : reintento.correcta === false ? 'incorrect' : '') : (reintento.respondidaEn ? 'disabled' : '');
                                        return <button key={opcion.id} className={`option-btn ${clase}`}
                                          onClick={() => responderReintento(reintento, opcion.id)}
                                          disabled={!!reintento.respondidaEn || reintentoPendiente === String(reintento._id)}>
                                          <span className="option-badge">{opcion.id}</span><span className="option-label">{opcion.texto}</span>
                                        </button>;
                                      })}
                                    </div>
                                    {reintentoPendiente === String(reintento._id) && <p role="status" className="nivel-hint">Guardando tu respuesta…</p>}
                                    {reintento.respondidaEn && <p role="status" className="nivel-hint">{reintento.correcta ? '¡Lo lograste! Este intento cuenta para el nivel.' : 'Esta alternativa tampoco coincide. Puedes pedir otra pregunta del mismo nivel.'}</p>}
                                  </div>
                                ))}
                              </div>
                            )}
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
                    <div style={{ margin: '1rem 0', display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <button className="submit-progress-btn" onClick={guardarAvance} disabled={guardandoProgreso}>
                        {guardandoProgreso ? 'Guardando…' : 'Guardar progreso'}
                      </button>
                      <button className="submit-progress-btn" onClick={enviarProgreso} disabled={guardandoProgreso}>
                        {guardandoProgreso ? 'Enviando…' : 'Finalizar evaluación'}
                      </button>
                    </div>
                    {avisoProgreso && <p role="status" style={{ textAlign: 'center', color: avisoProgreso.tipo === 'ok' ? '#15803d' : '#b91c1c' }}>{avisoProgreso.texto}</p>}
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

                    {/* El asistente guarda como avance; la evaluación se finaliza desde Preguntas. */}
                    <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                      <button
                        className="submit-progress-btn"
                        onClick={guardarAvance}
                        disabled={guardandoProgreso}
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
                {pestanaActiva === 'Vocabulario' && (
                  <div className="vocabulario-panel">
                    <div className="questions-header">
                      <h3>Mi vocabulario</h3>
                      <span className="questions-status">{vocabulario.length} palabra{vocabulario.length === 1 ? '' : 's'}</span>
                    </div>
                    <p className="vocabulario-ayuda">Selecciona una palabra en la lectura y marca el color violeta para guardarla aquí. Luego consulta a la IA por su significado y ejemplos.</p>
                    {vocabulario.length === 0 ? (
                      <p className="vocabulario-vacio">Aún no agregas palabras. Vuelve a la lectura, selecciona una palabra y elige el subrayado violeta.</p>
                    ) : (
                      <div className="vocabulario-lista">
                        {vocabulario.map((item) => (
                          <article className="vocabulario-item" key={item.palabra.toLocaleLowerCase()}>
                            <div className="vocabulario-item-top">
                              <strong>{item.palabra}</strong>
                              <div>
                                <button className="vocabulario-consultar" onClick={() => consultarPalabra(item.palabra)} disabled={item.consultando}>
                                  {item.consultando ? 'Consultando…' : item.definicion ? 'Consultar otra vez' : 'Preguntar a la IA'}
                                </button>
                                <button className="vocabulario-quitar" onClick={() => quitarPalabraVocabulario(item.palabra)} aria-label={`Quitar ${item.palabra}`}>Quitar</button>
                              </div>
                            </div>
                            {item.error && <p className="vocabulario-error" role="alert">{item.error}</p>}
                            {item.definicion && <p className="vocabulario-definicion">{item.definicion}</p>}
                          </article>
                        ))}
                      </div>
                    )}
                    <div style={{ marginTop: 16, textAlign: 'center' }}>
                      <button className="submit-progress-btn" onClick={guardarAvance} disabled={guardandoProgreso}>{guardandoProgreso ? 'Guardando…' : 'Guardar progreso'}</button>
                    </div>
                  </div>
                )}

                {pestanaActiva === 'Refuerzo' && (
                  <div className="retroalimentacion-panel">
                    <div className="questions-header">
                      <h3>Retroalimentación de la lectura</h3>
                      <span className="questions-status">Apoyo con IA</span>
                    </div>
                    <p className="vocabulario-ayuda">Genera una guía breve con la idea principal, un detalle interesante y una recomendación para comprender mejor el texto.</p>
                    <button className="retroalimentacion-generar" onClick={generarRetroalimentacion} disabled={generandoRetroalimentacion || !lecturaData?.parrafos?.length}>
                      {generandoRetroalimentacion ? 'Preparando retroalimentación…' : retroalimentacionTexto ? 'Generar otra vez' : 'Generar retroalimentación'}
                    </button>
                    {errorRetroalimentacion && <p className="vocabulario-error" role="alert">{errorRetroalimentacion}</p>}
                    {retroalimentacionTexto && <div className="retroalimentacion-resultado" aria-live="polite">{retroalimentacionTexto}</div>}
                    <div style={{ marginTop: 16, textAlign: 'center' }}>
                      <button className="submit-progress-btn" onClick={guardarAvance} disabled={guardandoProgreso}>{guardandoProgreso ? 'Guardando…' : 'Guardar progreso'}</button>
                      {avisoProgreso && <p role="status" style={{ color: avisoProgreso.tipo === 'ok' ? '#15803d' : '#b91c1c' }}>{avisoProgreso.texto}</p>}
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}
          {actividadCurso && (
            <section aria-labelledby="evidencia-title" style={{ maxWidth: 900, margin: '20px auto', padding: 22, borderRadius: 16, background: '#fff', border: '1px solid #dbe3f0', boxShadow: '0 8px 24px #1725540b' }}>
              <p style={{ margin: 0, color: '#635bdb', fontWeight: 700, textTransform: 'uppercase', fontSize: 12 }}>{({ introduccion: 'Introducción', explicacion: 'Explicación', practica: 'Práctica guiada', comprobacion: 'Comprobación' })[actividadCurso.etapa] || 'Actividad'}</p>
              <h3 id="evidencia-title" style={{ margin: '6px 0' }}>{actividadCurso.titulo || 'Evidencia de aprendizaje'}</h3>
              <p><strong>Objetivo:</strong> {actividadCurso.objetivoAprendizaje || actividadCurso.objetivoSesion || actividadCurso.temaSesion || 'Comprender la lectura asignada.'}</p>
              {actividadCurso.instrucciones && <p><strong>Consigna:</strong> {actividadCurso.instrucciones}</p>}
              {(entregasEvidencia[0]?.preguntaRefuerzo || (entregasEvidencia[0]?.puntaje != null && entregasEvidencia[0].puntaje < 70)) && (
                <div role="status" style={{ padding: 14, background: '#fff7ed', borderRadius: 10, margin: '14px 0' }}>
                  <strong>Vamos a practicarlo de otra manera</strong><p>{entregasEvidencia[0].retroalimentacion}</p>
                  {entregasEvidencia[0].preguntaRefuerzo && <p><strong>Nueva consigna:</strong> {entregasEvidencia[0].preguntaRefuerzo}</p>}
                  <button className="submit-progress-btn" type="button" onClick={() => { setRespuestaEvidencia(''); document.getElementById('respuesta-evidencia')?.focus(); }}>{entregasEvidencia[0].preguntaRefuerzo ? 'Reintentar con esta pregunta' : 'Reintentar actividad'}</button>
                </div>
              )}
              <label htmlFor="respuesta-evidencia" style={{ display: 'block', fontWeight: 600, margin: '14px 0 8px' }}>
                {actividadCurso.tipoEvidencia === 'palabras_clave' ? 'Escribe las palabras clave separadas por comas' : actividadCurso.tipoEvidencia === 'resumen' ? 'Escribe un resumen con tus propias palabras' : actividadCurso.tipoEvidencia === 'respuesta_abierta' ? 'Escribe tu respuesta y susténtala con la lectura' : 'Responde la actividad'}
              </label>
              <textarea id="respuesta-evidencia" value={respuestaEvidencia} onChange={(e) => setRespuestaEvidencia(e.target.value)} maxLength={12000} rows={5} placeholder={entregasEvidencia[0]?.preguntaRefuerzo || actividadCurso.instrucciones || 'Escribe aquí tu evidencia…'} style={{ width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: 10, border: '1px solid #cbd5e1', font: 'inherit' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 12 }}>
                <button className="submit-progress-btn" type="button" onClick={enviarEvidencia} disabled={enviandoEvidencia}>{enviandoEvidencia ? 'Revisando…' : 'Enviar evidencia'}</button>
                <span>Peso en el curso: {actividadCurso.peso ?? 100}%</span>
                {errorEvidencia && <span role="alert" style={{ color: '#b91c1c' }}>{errorEvidencia}</span>}
              </div>
              {entregasEvidencia.length > 0 && <div style={{ marginTop: 16 }} aria-live="polite">
                {entregasEvidencia.slice(0, 3).map((entrega) => <article key={entrega._id} style={{ borderTop: '1px solid #e2e8f0', padding: '12px 0' }}>
                  <strong>Intento {entrega.intento} · {entrega.estado === 'evaluada' ? `Puntaje: ${entrega.puntaje}/100` : 'Pendiente de revisión docente'}</strong>
                  <p>{entrega.retroalimentacion}</p>
                </article>)}
              </div>}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
