import { useState } from 'react';
import axios from 'axios';
import TeacherDashboard from './components/TeacherDashboard';

export default function App() {
  const [isRegister, setIsRegister] = useState(false);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState('student');
  const [seccion, setSeccion] = useState('4to A');
  const [codigoDocente, setCodigoDocente] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [userLogged, setUserLogged] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMensaje('');

    const url = isRegister 
      ? 'http://localhost:5000/api/auth/register' 
      : 'http://localhost:5000/api/auth/login';

    const payload = isRegister 
      ? { nombre, email, password, rol, seccion, codigoDocente } 
      : { email, password };

    try {
      const res = await axios.post(url, payload);
      setUserLogged(res.data);
    } catch (err) {
      setMensaje(err.response?.data?.message || 'Error en el servidor');
    }
  };

  if (userLogged && userLogged.rol === 'teacher') {
    return <TeacherDashboard user={userLogged} onLogout={() => setUserLogged(null)} />;
  }

  if (userLogged) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-md w-full">
          <h1 className="text-2xl font-bold text-indigo-600 mb-2">Bienvenido, {userLogged.nombre}</h1>
          <p className="text-gray-600 mb-4">Rol: <span className="font-bold uppercase">{userLogged.rol}</span></p>
          <button 
            onClick={() => setUserLogged(null)} 
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
          >
            Cerrar Sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full">
        <h1 className="text-2xl font-bold text-indigo-600 text-center mb-2">
          Asistente de Lectura 4to Sec.
        </h1>
        <p className="text-gray-500 text-center text-sm mb-6">
          {isRegister ? 'Crea tu cuenta institucional' : 'Ingresa a tu cuenta'}
        </p>

        <div className="flex border-b mb-6">
          <button
            type="button"
            className={`flex-1 py-2 font-medium text-sm text-center border-b-2 ${
              !isRegister ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
            onClick={() => { setIsRegister(false); setMensaje(''); }}
          >
            Iniciar Sesión
          </button>
          <button
            type="button"
            className={`flex-1 py-2 font-medium text-sm text-center border-b-2 ${
              isRegister ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
            onClick={() => { setIsRegister(true); setMensaje(''); }}
          >
            Crear Cuenta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
              <input
                type="text"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Juan Pérez"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Correo Institucional</label>
            <input
              type="email"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@escuela.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-indigo-600 focus:outline-none"
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12c1.074-4.65 5.062-8 10.222-8 5.16 0 9.148 3.35 10.222 8-1.074 4.65-5.062 8-10.222 8-5.16 0-9.148-3.35-10.222-8z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {isRegister && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Usuario</label>
                <select
                  value={rol}
                  onChange={(e) => setRol(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  <option value="student">Alumno / Estudiante</option>
                  <option value="teacher">Profesor / Docente</option>
                </select>
              </div>

              {/* Campo que aparece SOLO si selecciona Profesor */}
              {rol === 'teacher' && (
                <div>
                  <label className="block text-sm font-medium text-amber-700 mb-1">
                    Código de Verificación Docente
                  </label>
                  <input
                    type="password"
                    className="w-full px-4 py-2 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-amber-50"
                    value={codigoDocente}
                    onChange={(e) => setCodigoDocente(e.target.value)}
                    placeholder="Clave institucional entregada al colegio"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sección / Aula</label>
                <input
                  type="text"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={seccion}
                  onChange={(e) => setSeccion(e.target.value)}
                  placeholder="Ej. 4to A, 4to B"
                  required
                />
              </div>
            </>
          )}

          <button
            type="submit"
            className="w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700 transition mt-2"
          >
            {isRegister ? 'Registrar Cuenta' : 'Ingresar al Sistema'}
          </button>
        </form>

        {mensaje && (
          <p className="mt-4 p-3 bg-red-50 text-red-600 rounded-lg text-center text-sm font-medium">
            {mensaje}
          </p>
        )}
      </div>
    </div>
  );
}