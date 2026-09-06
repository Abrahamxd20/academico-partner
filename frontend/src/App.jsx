import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import ReadingView from './pages/student/ReadingView';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Carga del componente interactivo de evaluación */}
        <Route path="/student/reading" element={<ReadingView />} />
        
        <Route
          path="/teacher/dashboard"
          element={<div style={{ padding: '20px', color: '#fff' }}><h1>Dashboard del Profesor</h1></div>}
        />
        <Route
          path="/admin/users"
          element={<div style={{ padding: '20px', color: '#fff' }}><h1>Administración de Usuarios</h1></div>}
        />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}