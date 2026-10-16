import React, { createContext, useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
// Exportación nombrada explícita
export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const savedInfo = localStorage.getItem('userInfo');
      return savedInfo ? JSON.parse(savedInfo).user : null;
    } catch (e) {
      console.error('Error al leer el usuario de localStorage:', e);
      return null;
    }
  });

// AuthContext.js
const login = async (identifier, password) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    // Es clave que la clave sea 'identifier' para hacer match con req.body.identifier
    body: JSON.stringify({ identifier, password }), 
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Error de autenticación');
  }

  // Guardamos token + datos de usuario juntos, bajo la MISMA clave que usa
  // el interceptor de api.js ('userInfo'), para que el token se adjunte
  // automáticamente en cada petición a rutas protegidas.
  localStorage.setItem('userInfo', JSON.stringify({ token: data.token, user: data.user }));
  setUser(data.user);

  return data;
};

  const logout = () => {
    localStorage.removeItem('userInfo');
    setUser(null);
  };

  // Actualiza los datos del usuario en memoria y en localStorage sin cerrar sesión.
  // Lo usan ConfiguracionDocente (y cualquier otro componente que edite el perfil).
  const actualizarUsuario = (nuevosDatos) => {
    setUser((prev) => {
      const actualizado = { ...prev, ...nuevosDatos };
      const stored = JSON.parse(localStorage.getItem('userInfo') || '{}');
      localStorage.setItem('userInfo', JSON.stringify({ ...stored, user: actualizado }));
      return actualizado;
    });
  };

  // Login mediante Google Sign‑In
  const loginWithGoogle = async (credential) => {
    // Mismo puerto que el resto de la app (5000). Antes decía 5001 por error,
    // por eso el login con Google y el normal parecían "comportarse distinto".
        const response = await fetch(`${API_BASE_URL}/api/auth/google-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ credential }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Error en autenticación Google');
    }
    // Guardamos token + datos de usuario como en login tradicional
    localStorage.setItem('userInfo', JSON.stringify({ token: data.token, user: data.user }));
    setUser(data.user);
    return data;
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loginWithGoogle, actualizarUsuario }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
