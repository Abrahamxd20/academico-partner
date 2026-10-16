import React, { useContext } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, LogOut, Users } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import './AdminNavigation.css';

export default function AdminNavigation() {
  const { logout } = useContext(AuthContext);
  return (
    <nav className="admin-navigation" aria-label="Menú de administración">
      <div className="admin-navigation-links">
        <NavLink to="/admin/dashboard" end className={({ isActive }) => `admin-navigation-link${isActive ? ' is-active' : ''}`}>
          <LayoutDashboard size={17} /> <span>Panel de administración</span>
        </NavLink>
        <NavLink to="/admin/users" className={({ isActive }) => `admin-navigation-link${isActive ? ' is-active' : ''}`}>
          <Users size={17} /> <span>Gestión de usuarios</span>
        </NavLink>
      </div>
      <button type="button" className="admin-navigation-logout" onClick={logout}>
        <LogOut size={16} /><span>Cerrar sesión</span>
      </button>
    </nav>
  );
}
