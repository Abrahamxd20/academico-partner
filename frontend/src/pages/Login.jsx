import { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { Mail, Lock, BookOpen, Smartphone } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const userData = await login(email, password);

      if (userData.rol === 'docente') {
        navigate('/teacher/dashboard');
      } else if (userData.rol === 'admin') {
        navigate('/admin/users');
      } else {
        navigate('/student/reading');
      }
    } catch (err) {
      setError(
        err.response?.data?.message || 'Credenciales inválidas o problema de conexión.'
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

      {/* Lado Derecho: Formulario */}
      <div className="login-form-side">
        <div className="login-header">
          <div className="header-icon">
            <BookOpen size={28} color="#ffffff" />
          </div>
          <h2>Inicio de Sesión</h2>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="input-field-group">
            <Mail className="input-icon" size={20} />
            <label>Correo Electrónico</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ejemplo@colegio.edu.pe"
              required
            />
          </div>

          <div className="input-field-group">
            <Lock className="input-icon" size={20} />
            <label>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <div className="form-actions">
            <Link to="/register" className="link-secondary">
              ¿Necesitas una Cuenta?
            </Link>
          </div>

          <button type="submit" className="btn-purple-submit" disabled={loading}>
            {loading ? 'Ingresando...' : 'Iniciar Sesión'}
          </button>
        </form>
      </div>
    </div>
  );
}