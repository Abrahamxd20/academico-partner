import { useState, useEffect } from 'react';
import axios from 'axios';

export default function TeacherDashboard({ user, onLogout }) {
  const [readings, setReadings] = useState([]);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [contenido, setContenido] = useState('');
  const [seccion, setSeccion] = useState(user.seccion || '4to A');
  const [mensaje, setMensaje] = useState('');

  const fetchReadings = async () => {
    try {
      const res = await axios.get(`http://localhost:5000/api/readings/teacher/${user._id}`);
      setReadings(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchReadings();
  }, [user._id]);

  const handleCreateReading = async (e) => {
    e.preventDefault();
    try {
      await axios.post('http://localhost:5000/api/readings', {
        titulo,
        descripcion,
        contenido,
        seccion,
        profesorId: user._id
      });
      setMensaje('Lectura asignada correctamente');
      setTitulo('');
      setDescripcion('');
      setContenido('');
      fetchReadings();
    } catch (err) {
      setMensaje('Error al crear la lectura');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <header className="flex justify-between items-center bg-white p-4 rounded-xl shadow-md mb-6">
        <div>
          <h1 className="text-xl font-bold text-indigo-600">Panel del Docente</h1>
          <p className="text-sm text-gray-500">Profesor: {user.nombre} | Sección: {user.seccion}</p>
        </div>
        <button 
          onClick={onLogout}
          className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 text-sm font-semibold transition"
        >
          Cerrar Sesión
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Formulario Crear Lectura */}
        <div className="bg-white p-6 rounded-xl shadow-md md:col-span-1">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Nueva Lectura</h2>
          <form onSubmit={handleCreateReading} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Título</label>
              <input
                type="text"
                className="w-full border rounded-lg p-2 outline-none focus:ring-2 focus:ring-indigo-500"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Descripción Breve</label>
              <input
                type="text"
                className="w-full border rounded-lg p-2 outline-none focus:ring-2 focus:ring-indigo-500"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Sección Destino</label>
              <input
                type="text"
                className="w-full border rounded-lg p-2 outline-none focus:ring-2 focus:ring-indigo-500"
                value={seccion}
                onChange={(e) => setSeccion(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Texto de Lectura</label>
              <textarea
                rows="5"
                className="w-full border rounded-lg p-2 outline-none focus:ring-2 focus:ring-indigo-500"
                value={contenido}
                onChange={(e) => setContenido(e.target.value)}
                required
              ></textarea>
            </div>
            <button
              type="submit"
              className="w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700 transition"
            >
              Publicar Lectura
            </button>
          </form>
          {mensaje && <p className="mt-3 text-sm text-center text-indigo-600">{mensaje}</p>}
        </div>

        {/* Lista de Lecturas Publicadas */}
        <div className="bg-white p-6 rounded-xl shadow-md md:col-span-2">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Mis Lecturas Asignadas</h2>
          {readings.length === 0 ? (
            <p className="text-gray-400 text-sm">Aún no has publicado lecturas.</p>
          ) : (
            <div className="space-y-4">
              {readings.map((item) => (
                <div key={item._id} className="border p-4 rounded-lg hover:border-indigo-500 transition">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-indigo-600">{item.titulo}</h3>
                    <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-1 rounded-md font-semibold">
                      {item.seccion}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{item.descripcion}</p>
                  <p className="text-xs text-gray-400 line-clamp-2">{item.contenido}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}