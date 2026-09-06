import { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { Mail, Lock, User, UserCheck, BookOpen, Smartphone } from 'lucide-react';

export default function Register() {
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    password: '',
    rol: 'alumno',
    grado: '4to Secundaria',
    seccion: 'A'
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // 1. Registra al usuario en el Backend
      await axios.post('http://localhost:5000/api/auth/register', formData);
      
      // 2. Inicia sesión automáticamente con el contexto
      const userData = await login(formData.email, formData.password);
      
      // 3. Redirige a la vista correspondiente según el rol
      const rol = userData.rol?.toLowerCase();
      if (rol === 'docente' || rol === 'profesor') {
        navigate('/teacher/dashboard');
      } else if (rol === 'admin') {
        navigate('/admin/users');
      } else {
        navigate('/student/reading');
      }
    } catch (err) {
      setError(
        err.response?.data?.message || 'Error al registrar la cuenta'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      {/* Lado Izquierdo: Ilustración */}
      <div className="login-illustration-side">
        <div className="illustration-box">
          <div className="illustration-avatar">
            <Smartphone size={90} color="#ffffff" />
          </div>
          <div className="illustration-text">
            <h3>Asistente de Lectura</h3>
            <p>Comprensión Lectora para 4to de Secundaria</p>
          </div>
        </div>
      </div>

      {/* Lado Derecho: Formulario de Registro */}
      <div className="login-form-side">
        <div className="login-header">
          <div className="header-icon">
            <BookOpen size={28} color="#ffffff" />
          </div>
          <h2>Crear Cuenta</h2>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="input-field-group">
            <User className="input-icon" size={20} />
            <label>Nombre Completo</label>
            <input
              type="text"
              name="nombre"
              value={formData.nombre}
              onChange={handleChange}
              placeholder="Juan Pérez"
              required
            />
          </div>

          <div className="input-field-group">
            <Mail className="input-icon" size={20} />
            <label>Correo Electrónico</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="ejemplo@colegio.edu.pe"
              required
            />
          </div>

          <div className="input-field-group">
            <Lock className="input-icon" size={20} />
            <label>Contraseña</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="••••••••"
              required
            />
          </div>

          <div className="input-field-group">
            <UserCheck className="input-icon" size={20} />
            <label>Rol</label>
            <select name="rol" value={formData.rol} onChange={handleChange}>
              <option value="alumno">Alumno</option>
              <option value="docente">Docente</option>
            </select>
          </div>

          <div className="form-actions">
            <Link to="/login" className="link-secondary">
              ¿Ya tienes cuenta? Inicia Sesión
            </Link>
          </div>

          <button type="submit" className="btn-purple-submit" disabled={loading}>
            {loading ? 'Registrando...' : 'Registrarse'}
          </button>
        </form>
      </div>
    </div>
  );
}