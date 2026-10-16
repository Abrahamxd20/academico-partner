import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend 
} from 'recharts';
import { Download, FileText } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import './ReportDashboard.css';

// Datos de prueba para gráficos
const performanceData = [
  { evaluacion: 'Eval 1', promedio: 14.5, objetivo: 15 },
  { evaluacion: 'Eval 2', promedio: 16.2, objetivo: 15 },
  { evaluacion: 'Eval 3', promedio: 13.8, objetivo: 15 },
  { evaluacion: 'Eval 4', promedio: 17.1, objetivo: 15 },
  { evaluacion: 'Parcial', promedio: 15.4, objetivo: 15 },
];

const distributionData = [
  { name: 'Destacado (18-20)', value: 8, color: '#3b82f6' },
  { name: 'Logrado (14-17)', value: 18, color: '#60a5fa' },
  { name: 'En Proceso (11-13)', value: 5, color: '#94a3b8' },
  { name: 'En Inicio (0-10)', value: 2, color: '#475569' },
];

export const ReportDashboard = () => {

  // Función para generar y descargar la Ficha de Observación en PDF
  const handleDownloadPDF = () => {
    const element = document.getElementById('ficha-pdf-template');
    
    // Configuración para html2pdf
    const opt = {
      margin:       10,
      filename:     'Ficha_de_Observacion_Academica.pdf',
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    element.style.display = 'block'; // Mostrar temporalmente para capturar
    html2pdf().set(opt).from(element).save().then(() => {
      element.style.display = 'none'; // Ocultar nuevamente
    });
  };

  return (
    <div className="dashboard-container">
      {/* Encabezado */}
      <header className="dashboard-header">
        <div className="dashboard-title">
          <h1>Monitoreo de Rendimiento Académico</h1>
          <p>Panel Estadístico del Aula - Evaluación Continua</p>
        </div>
        <button className="btn-download" onClick={handleDownloadPDF}>
          <Download size={18} />
          Descargar Ficha de Observación
        </button>
      </header>

      {/* KPIs de Resumen */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-title">Promedio General</div>
          <div className="kpi-value">15.4 / 20</div>
          <div className="kpi-subtext">+1.2 vs. mes anterior</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">Alumnos Monitoreados</div>
          <div className="kpi-value">33</div>
          <div className="kpi-subtext">100% de asistencia activa</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">Evaluación Completada</div>
          <div className="kpi-value">88%</div>
          <div className="kpi-subtext">5 de 6 quizzes finalizados</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">Alumnos en Riesgo</div>
          <div className="kpi-value" style={{ color: '#f87171' }}>2</div>
          <div className="kpi-subtext">Requieren refuerzo pedagógico</div>
        </div>
      </div>

      {/* Gráficos */}
      <div className="charts-grid">
        {/* Gráfico de Barras */}
        <div className="chart-card">
          <h3>Evolución de Promedios por Evaluación</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={performanceData}>
              <XAxis dataKey="evaluacion" stroke="#94a3b8" />
              <YAxis domain={[0, 20]} stroke="#94a3b8" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff' }} 
              />
              <Bar dataKey="promedio" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Gráfico Circular de Distribución */}
        <div className="chart-card">
          <h3>Niveles de Logro</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={distributionData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={4}
              >
                {distributionData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff' }} 
              />
              <Legend wrapperStyle={{ color: '#94a3b8', fontSize: '12px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* --- PLANTILLA OCULTA PARA DESCARGAR PDF (FICHA DE OBSERVACIÓN) --- */}
      <div id="ficha-pdf-template" style={{ color: '#000', padding: '20px', fontFamily: 'Arial' }}>
        <div style={{ borderBottom: '2px solid #1e3a8a', paddingBottom: '10px', marginBottom: '20px' }}>
          <h2 style={{ color: '#1e3a8a', margin: 0 }}>FICHA DE OBSERVACIÓN Y MONITOREO ACADÉMICO</h2>
          <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#4b5563' }}>
            Reporte de Desempeño General del Aula | Proyecto Academico Partner
          </p>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '12px' }}>
          <tbody>
            <tr>
              <td style={{ padding: '8px', border: '1px solid #ddd', fontWeight: 'bold', width: '25%' }}>Fecha:</td>
              <td style={{ padding: '8px', border: '1px solid #ddd' }}>{new Date().toLocaleDateString()}</td>
              <td style={{ padding: '8px', border: '1px solid #ddd', fontWeight: 'bold', width: '25%' }}>Docente:</td>
              <td style={{ padding: '8px', border: '1px solid #ddd' }}>Prof. Administrador</td>
            </tr>
            <tr>
              <td style={{ padding: '8px', border: '1px solid #ddd', fontWeight: 'bold' }}>Total Alumnos:</td>
              <td style={{ padding: '8px', border: '1px solid #ddd' }}>33 Alumnos</td>
              <td style={{ padding: '8px', border: '1px solid #ddd', fontWeight: 'bold' }}>Promedio Aula:</td>
              <td style={{ padding: '8px', border: '1px solid #ddd' }}>15.4 / 20</td>
            </tr>
          </tbody>
        </table>

        <h3 style={{ color: '#1e3a8a', borderBottom: '1px solid #ddd', paddingBottom: '5px' }}>
          Resumen de Criterios Observados
        </h3>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginTop: '10px' }}>
          <thead>
            <tr style={{ backgroundColor: '#f1f5f9' }}>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Criterio de Evaluación</th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>Nivel General</th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Observaciones Pedagógicas</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ border: '1px solid #ddd', padding: '8px' }}>Comprensión Lectora / Quizzes</td>
              <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>Logrado</td>
              <td style={{ border: '1px solid #ddd', padding: '8px' }}>Buena retención en las lecturas asignadas.</td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #ddd', padding: '8px' }}>Participación e Interacción con IA</td>
              <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>Destacado</td>
              <td style={{ border: '1px solid #ddd', padding: '8px' }}>Uso recurrente del asistente para aclaración de dudas.</td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #ddd', padding: '8px' }}>Entrega de Evaluaciones</td>
              <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>En Proceso</td>
              <td style={{ border: '1px solid #ddd', padding: '8px' }}>Se detectan 2 alumnos con retrasos puntuales.</td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginTop: '30px' }}>
          <h4 style={{ color: '#1e3a8a', marginBottom: '5px' }}>Conclusiones y Recomendaciones:</h4>
          <p style={{ fontSize: '11px', color: '#333', lineHeight: '1.5' }}>
            El grupo mantiene una tendencia positiva en su promedio acumulado. Se sugiere programar una sesión de reforzamiento guiado con el asistente interactivo para el segmento de alumnos en estado "En Proceso" o "En Inicio".
          </p>
        </div>

        <div style={{ marginTop: '60px', display: 'flex', justifyContent: 'space-between', textAlign: 'center', fontSize: '11px' }}>
          <div style={{ width: '40%', borderTop: '1px solid #000', paddingTop: '5px' }}>
            Firma del Docente Evaluador
          </div>
          <div style={{ width: '40%', borderTop: '1px solid #000', paddingTop: '5px' }}>
            Sello / Coordinación Académica
          </div>
        </div>
      </div>
    </div>
  );
};