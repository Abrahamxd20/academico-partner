import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ReadingView = lazy(() => import('./pages/student/ReadingView'));
const UserManagement = lazy(() => import('./pages/admin/UserManagement'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const TeacherDashboard = lazy(() => import('./pages/teacher/TeacherDashboard'));
const CursosLista = lazy(() => import('./pages/cursos/CursosLista'));
const CursoView = lazy(() => import('./pages/cursos/CursoView'));

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#64748b' }}>Cargando…</div>}>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route path="/student/reading" element={
          <ProtectedRoute rolesPermitidos={['alumno']}><ReadingView /></ProtectedRoute>
        } />

        <Route path="/cursos" element={
          <ProtectedRoute rolesPermitidos={['alumno', 'docente', 'admin']}><CursosLista /></ProtectedRoute>
        } />
        <Route path="/cursos/:id" element={
          <ProtectedRoute rolesPermitidos={['alumno', 'docente', 'admin']}><CursoView /></ProtectedRoute>
        } />

        <Route path="/admin/users" element={
          <ProtectedRoute rolesPermitidos={['admin']}><UserManagement /></ProtectedRoute>
        } />
        <Route path="/admin/dashboard" element={
          <ProtectedRoute rolesPermitidos={['admin']}><AdminDashboard /></ProtectedRoute>
        } />

        <Route path="/teacher/dashboard" element={
          <ProtectedRoute rolesPermitidos={['docente']}><TeacherDashboard /></ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
