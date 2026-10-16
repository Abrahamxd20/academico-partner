import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import AuthContext from '../context/AuthContext';
import { User, Lock, BookOpen, Sparkles } from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';
import './login.css';

const GRUPOS_ROL = {
  estudiante: ['alumno', 'estudiante'],
  docente: ['docente', 'profesor'],
};
export default function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const auth = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!auth || !auth.login) {
        throw new Error("Servicio de autenticación no disponible");
      }

      const data = await auth.login(identifier, password);
      const userRole = (data?.user?.rol || '').toLowerCase();

      if (userRole === 'admin') {
        navigate('/admin/dashboard', { replace: true });
      } else if (GRUPOS_ROL.docente.includes(userRole)) {
        navigate('/teacher/dashboard', { replace: true });
      } else {
        navigate('/cursos', { replace: true });
      }
    } catch (err) {
      console.error('Error al iniciar sesión:', err);
      setError(err.response?.data?.message || err.message || 'Error de autenticación');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setError(null);
    setLoading(true);
    try {
      if (!credentialResponse.credential || !auth?.loginWithGoogle) {
        throw new Error('No se pudo iniciar sesión con Google. Inténtalo de nuevo.');
      }

      const data = await auth.loginWithGoogle(credentialResponse.credential);
      const userRole = (data?.user?.rol || '').toLowerCase();
      if (userRole === 'admin') {
        navigate('/admin/dashboard', { replace: true });
      } else if (GRUPOS_ROL.docente.includes(userRole)) {
        navigate('/teacher/dashboard', { replace: true });
      } else {
        navigate('/cursos', { replace: true });
      }
    } catch (err) {
      console.error('Error al iniciar sesión con Google:', err);
      setError(err.message || 'No se pudo iniciar sesión con Google');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-experience-container">
      {/* Luces de fondo decorativas */}
      <div className="aurora-blob blob-1"></div>
      <div className="aurora-blob blob-2"></div>

      <div className="glass-login-card">
        {/* Panel Izquierdo: Branding & Visual */}
        <div className="brand-panel">
          <div className="brand-badge">
            <Sparkles size={16} /> IA Educativa
          </div>
          <div className="brand-hero">
            <div className="brand-icon-wrapper">
              <BookOpen size={36} color="#ffffff" />
            </div>
            <h2>Asistente de Comprensión Lectora</h2>
            <p>Potencia tus habilidades de lectura interactiva con retroalimentación inteligente.</p>
          </div>
          <div className="brand-footer">
            <span>© 2026 Academic Partner</span>
          </div>
        </div>

        {/* Panel Derecho: Formulario */}
        <div className="form-panel">
          <div className="form-header">
            <h3>¡Bienvenido de nuevo!</h3>
            <p>Ingresa tus credenciales para acceder</p>
          </div>

          {error && <div className="modern-error-banner">{error}</div>}

          <form onSubmit={handleSubmit} className="modern-form">
            <div className="modern-field">
              <label>Usuario o Correo</label>
              <div className="pill-input-box">
                <User className="pill-icon" size={18} />
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="usuario@colegio.edu.pe"
                  required
                />
              </div>
            </div>

            <div className="modern-field">
              <label>Contraseña</label>
              <div className="pill-input-box">
                <Lock className="pill-icon" size={18} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button type="submit" className="gradient-btn-submit" disabled={loading}>
              {loading ? 'Validando...' : 'Iniciar Sesión'}
            </button>
          </form>

          <div className="login-divider"><span>o continúa con</span></div>
          <div className="google-login-button">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError('No se pudo conectar con Google. Inténtalo de nuevo.')}
              text="continue_with"
              shape="rectangular"
              size="large"
              width="320"
              useOneTap={false}
              theme="outline"
              disabled={loading}
            />
          </div>

          <div className="form-footer">
            <p>
              ¿No tienes una cuenta? <Link to="/register">Crear cuenta</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
