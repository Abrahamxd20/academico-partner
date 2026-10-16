import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import { User, Mail, Lock, BookOpen, Sparkles, UserCheck, Shield, KeyRound } from 'lucide-react';
import './login.css'; // Reutiliza la misma hoja de estilos

export default function Register() {
  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    email: '',
    grado: '',
    seccion: '',
    password: '',
    rol: 'alumno',
    claveDocente: '',
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const esDocente = formData.rol === 'docente';

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Si no eligió "Docente", no tiene sentido mandar la clave secreta.
      const payload = { ...formData };
      if (!esDocente) delete payload.claveDocente;

      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al registrar el usuario');
      }

      navigate('/login');
    } catch (err) {
      console.error('Error en el registro:', err);
      setError(err.message || 'Ocurrió un error al crear la cuenta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-experience-container register-experience-container">
      {/* Luces de fondo aurora */}
      <div className="aurora-blob blob-1"></div>
      <div className="aurora-blob blob-2"></div>

      <div className="glass-login-card">
        {/* Panel Izquierdo: Branding */}
        <div className="brand-panel">
          <div className="brand-badge">
            <Sparkles size={16} /> IA Educativa
          </div>
          <div className="brand-hero">
            <div className="brand-icon-wrapper">
              <BookOpen size={36} color="#ffffff" />
            </div>
            <h2>Asistente de Lectora</h2>
            <p>Comprensión Lectora para 4to de Secundaria. Únete para potenciar tu aprendizaje con retroalimentación en tiempo real.</p>
          </div>
          <div className="brand-footer">
            <span>© 2026 Academic Partner</span>
          </div>
        </div>

        {/* Panel Derecho: Formulario de Registro */}
        <div className="form-panel">
          <div className="form-header">
            <h3>Crear Cuenta</h3>
            <p>Ingresa tus datos para registrarte en la plataforma</p>
          </div>

          {error && <div className="modern-error-banner">{error}</div>}

          <form onSubmit={handleSubmit} className="modern-form">
            <div className="modern-field">
              <label>Nombre</label>
              <div className="pill-input-box">
                <UserCheck className="pill-icon" size={18} />
                <input
                  type="text"
                  name="nombre"
                  value={formData.nombre}
                  onChange={handleChange}
                  placeholder="Marcos"
                  required
                />
              </div>
            </div>

            <div className="modern-field">
              <label>Apellido</label>
              <div className="pill-input-box">
                <User className="pill-icon" size={18} />
                <input
                  type="text"
                  name="apellido"
                  value={formData.apellido}
                  onChange={handleChange}
                  placeholder="Pérez"
                  required
                />
              </div>
            </div>

            <div className="modern-field">
              <label>Correo Electrónico</label>
              <div className="pill-input-box">
                <Mail className="pill-icon" size={18} />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="ejemplo@colegio.edu.pe"
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
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <div className="modern-field">
              <label>Rol</label>
              <div className="pill-input-box">
                <Shield className="pill-icon" size={18} />
                <select
                  name="rol"
                  value={formData.rol}
                  onChange={handleChange}
                  className="pill-select"
                >
                  <option value="alumno">Alumno</option>
                  <option value="docente">Docente</option>
                </select>
              </div>
            </div>
                            {!esDocente && (
              <>
                <div className="modern-field">
                  <label>Grado</label>
                  <div className="pill-input-box">
                    <input type="text" name="grado" value={formData.grado} onChange={handleChange} placeholder="Ej: 4°" required />
                  </div>
                </div>
                <div className="modern-field">
                  <label>Sección</label>
                  <div className="pill-input-box">
                    <input type="text" name="seccion" value={formData.seccion} onChange={handleChange} placeholder="Ej: A" required />
                  </div>
                </div>
              </>
            )}
            {/* Solo aparece si eligió "Docente": clave secreta que confirma que
                de verdad es profesor y no un alumno intentando registrarse como tal. */}
            {esDocente && (
              <div className="modern-field">
                <label>Clave de Docente</label>
                <div className="pill-input-box">
                  <KeyRound className="pill-icon" size={18} />
                  <input
                    type="password"
                    name="claveDocente"
                    value={formData.claveDocente}
                    onChange={handleChange}
                    placeholder="Proporcionada por tu coordinación"
                    required
                  />
                </div>
              </div>
            )}

            <button type="submit" className="gradient-btn-submit" disabled={loading}>
              {loading ? 'Creando cuenta...' : 'Registrarse'}
            </button>
          </form>

          <div className="form-footer">
            <p>
              ¿Ya tienes cuenta? <Link to="/login">Inicia Sesión</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
