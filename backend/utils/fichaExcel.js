const ExcelJS = require('exceljs');
const { NIVELES, BANDAS, puntaje, bandaDe, construirDashboard, nivelAReforzar } = require('./reportes');

const AZUL = 'FF2B3E70';
const COLORES_BANDA = {
  'Destacado': { fondo: 'FFC6EFCE', texto: 'FF006100' },
  'Logrado': { fondo: 'FFDDEBF7', texto: 'FF1F4E79' },
  'En proceso': { fondo: 'FFFFEB9C', texto: 'FF9C5700' },
  'Requiere apoyo': { fondo: 'FFFFC7CE', texto: 'FF9C0006' },
};
const lado = { style: 'thin', color: { argb: 'FFCBD5E1' } };
const BORDES = { top: lado, left: lado, bottom: lado, right: lado };

const COLUMNAS = [
  ['N°', 5], ['Estudiante', 28], ['Grado', 8], ['Sección', 9], ['Lectura', 30], ['Curso', 25], ['Versión del plan', 14], ['Fecha', 12],
  ['% Aciertos (PA)', 12], ['Eficiencia (ETR)', 12], ['IDLI', 10],
  ['Inflesz', 10], ['Valoración', 15],
  ['ROUGE-L', 10], ['Valoración', 15],
  ['ROUGE-S', 10], ['Valoración', 15],
  ['Nivel a reforzar', 17], ['Observación sugerida', 52],
  ['Observaciones del docente', 40], ['Estado de seguimiento', 19],
];
const GRUPOS = [
  ['Datos del estudiante', 1, 8], ['Indicadores generales', 9, 11], ['Nivel literal', 12, 13],
  ['Nivel inferencial', 14, 15], ['Nivel crítico', 16, 17], ['Seguimiento docente', 18, 21],
];
const TOTAL_COLS = COLUMNAS.length;

function encabezado(celda, texto) {
  celda.value = texto;
  celda.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  celda.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  celda.border = BORDES;
}

function pintarBanda(celda, banda) {
  const c = COLORES_BANDA[banda];
  celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.fondo } };
  celda.font = { bold: true, color: { argb: c.texto }, size: 10 };
  celda.alignment = { horizontal: 'center', vertical: 'middle' };
}

const fmtFecha = (d) => (d ? new Date(d).toLocaleDateString('es-PE') : '—');

function hojaFicha(wb, registros, docente, filtros) {
  const ws = wb.addWorksheet('Ficha de observación', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 7 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  COLUMNAS.forEach(([, ancho], i) => { ws.getColumn(i + 1).width = ancho; });

  ws.mergeCells(1, 1, 1, TOTAL_COLS);
  const titulo = ws.getCell(1, 1);
  titulo.value = 'FICHA DE OBSERVACIÓN · COMPRENSIÓN LECTORA';
  titulo.font = { bold: true, size: 16, color: { argb: AZUL } };
  titulo.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(1).height = 28;

  const meta = [
    `Docente: ${docente || '—'}     |     Fecha de emisión: ${fmtFecha(new Date())}`,
    `Periodo: ${filtros.desde ? fmtFecha(filtros.desde) : 'inicio'} – ${filtros.hasta ? fmtFecha(filtros.hasta) : 'hoy'}     |     Grado: ${filtros.grado || 'Todos'}     |     Sección: ${filtros.seccion || 'Todas'}`,
    `Lectura: ${filtros.lecturaTitulo || 'Todas'}     |     Registros incluidos: ${registros.length}`,
  ];
  meta.forEach((texto, i) => {
    ws.mergeCells(i + 2, 1, i + 2, TOTAL_COLS);
    const c = ws.getCell(i + 2, 1);
    c.value = texto;
    c.font = { size: 10, color: { argb: 'FF475569' } };
  });

  // Fila 6: grupos de columnas · Fila 7: encabezados
  GRUPOS.forEach(([texto, desde, hasta]) => {
    ws.mergeCells(6, desde, 6, hasta);
    encabezado(ws.getCell(6, desde), texto);
    for (let c = desde; c <= hasta; c += 1) ws.getCell(6, c).border = BORDES;
  });
  COLUMNAS.forEach(([texto], i) => encabezado(ws.getCell(7, i + 1), texto));
  ws.getRow(7).height = 32;

  registros.forEach((r, i) => {
    const lit = puntaje(r, 'literal');
    const inf = puntaje(r, 'inferencial');
    const cri = puntaje(r, 'critico');
    const bandas = { literal: bandaDe(lit, 'literal'), inferencial: bandaDe(inf, 'inferencial'), critico: bandaDe(cri, 'critico') };
    const refuerzo = nivelAReforzar(bandas);

    const fila = ws.addRow([
      i + 1,
      r.alumnoId?.nombre || 'Alumno',
      r.alumnoId?.grado || '',
      r.alumnoId?.seccion || '',
      r.readingId?.titulo || '—',
      r.cursoId?.nombre || 'Sin curso vinculado',
      r.planVersion ? `Versión ${r.planVersion}` : 'Sin versión registrada',
      r.fecha ? new Date(r.fecha) : null,
      (r.porcentajeAciertos || 0) / 100,
      (r.eficienciaTemporal || 0) / 100,
      puntaje(r, 'general') / 100,
      Number(puntaje(r, 'literal').toFixed(1)), bandas.literal,
      puntaje(r, 'inferencial') / 100, bandas.inferencial,
      puntaje(r, 'critico') / 100, bandas.critico,
      refuerzo.etiqueta, refuerzo.observacion,
      '', 'Pendiente',
    ]);

    fila.eachCell({ includeEmpty: true }, (celda, col) => {
      celda.border = BORDES;
      celda.font = { size: 10 };
      celda.alignment = { vertical: 'middle', wrapText: true, horizontal: [1, 3, 4, 8].includes(col) ? 'center' : 'left' };
    });
    fila.getCell(8).numFmt = 'dd/mm/yyyy';
    [9, 10, 11, 14, 16].forEach((c) => { fila.getCell(c).numFmt = '0.0%'; fila.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' }; });
    fila.getCell(12).numFmt = '0.0';
    fila.getCell(12).alignment = { horizontal: 'center', vertical: 'middle' };
    pintarBanda(fila.getCell(13), bandas.literal);
    pintarBanda(fila.getCell(15), bandas.inferencial);
    pintarBanda(fila.getCell(17), bandas.critico);
    fila.getCell(21).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['"Pendiente,En seguimiento,Superado"'],
    };
  });

  if (registros.length) {
    ws.autoFilter = { from: { row: 7, column: 1 }, to: { row: 7 + registros.length, column: TOTAL_COLS } };
  }

  const pie = 7 + registros.length + 3;
  ws.getCell(pie, 2).value = 'Firma del docente: ______________________________';
  ws.getCell(pie, 5).value = 'V°B° Coordinación: ______________________________';
  [ws.getCell(pie, 2), ws.getCell(pie, 5)].forEach((c) => { c.font = { size: 10, color: { argb: 'FF475569' } }; });
}

function hojaResumen(wb, registros) {
  const ws = wb.addWorksheet('Resumen');
  ws.getColumn(1).width = 26;
  for (let c = 2; c <= 6; c += 1) ws.getColumn(c).width = 17;

  ws.getCell(1, 1).value = 'RESUMEN POR NIVEL DE COMPRENSIÓN';
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: AZUL } };

  ['Nivel', 'Promedio (0–100)', ...BANDAS].forEach((t, i) => encabezado(ws.getCell(3, i + 1), t));
  ['literal', 'inferencial', 'critico', 'general'].forEach((n, i) => {
    const d = construirDashboard(registros, n);
    const fila = ws.getRow(4 + i);
    fila.values = [NIVELES[n].etiqueta, d.kpis.promedio, ...d.distribucion.map((x) => x.cantidad)];
    fila.eachCell((c) => { c.border = BORDES; c.alignment = { horizontal: 'center', vertical: 'middle' }; });
    fila.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    fila.getCell(2).numFmt = '0.0';
  });
  ws.getCell(8, 1).value = 'Las columnas de valoración indican número de registros en cada banda.';
  ws.getCell(8, 1).font = { italic: true, size: 9, color: { argb: 'FF64748B' } };

  ws.getCell(10, 1).value = 'ESCALA DE VALORACIÓN';
  ws.getCell(10, 1).font = { bold: true, size: 12, color: { argb: AZUL } };
  ['Nivel', ...BANDAS].forEach((t, i) => encabezado(ws.getCell(11, i + 1), t));
  ['literal', 'inferencial', 'critico', 'general'].forEach((n, i) => {
    const [a, b, c] = NIVELES[n].umbrales;
    const fila = ws.getRow(12 + i);
    fila.values = [NIVELES[n].etiqueta, `≥ ${a}`, `${b} – ${a - 0.1}`, `${c} – ${b - 0.1}`, `< ${c}`];
    fila.eachCell((cel) => { cel.border = BORDES; cel.alignment = { horizontal: 'center', vertical: 'middle' }; });
    fila.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    BANDAS.forEach((banda, k) => pintarBanda(fila.getCell(2 + k), banda));
  });
  ws.getCell(16, 1).value = 'ROUGE-L y ROUGE-S se expresan multiplicados por 100. Inflesz e IDLI se limitan a 0–100.';
  ws.getCell(16, 1).font = { italic: true, size: 9, color: { argb: 'FF64748B' } };
}

function hojaBorradores(wb, borradores = []) {
  if (!borradores.length) return;
  const ws = wb.addWorksheet('Avance de alumnos');
  ws.columns = [
    { header: 'Estudiante', key: 'alumno', width: 24 }, { header: 'Grado', key: 'grado', width: 12 },
    { header: 'Sección', key: 'seccion', width: 12 }, { header: 'Lectura', key: 'lectura', width: 30 },
    { header: 'Última actualización', key: 'fecha', width: 20 }, { header: 'Preguntas respondidas', key: 'respondidas', width: 20 },
    { header: 'Respuesta literal', key: 'literal', width: 50 }, { header: 'Respuesta inferencial', key: 'inferencial', width: 50 },
    { header: 'Respuesta crítica', key: 'critico', width: 50 }, { header: 'Refuerzo', key: 'refuerzo', width: 50 },
    { header: 'Vocabulario', key: 'vocabulario', width: 40 }, { header: 'Conversación con asistente', key: 'asistente', width: 60 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF274C77' } };
  borradores.forEach((b) => {
    ws.addRow({
      alumno: b.alumnoId?.nombre || 'Alumno', grado: b.alumnoId?.grado || '', seccion: b.alumnoId?.seccion || '',
      lectura: b.readingId?.titulo || 'Sin título', fecha: b.updatedAt ? new Date(b.updatedAt).toLocaleString('es-PE') : '',
      respondidas: Object.keys(b.respuestas || {}).length, literal: b.textoLiteral || '',
      inferencial: b.respuestaInferencial || '', critico: b.respuestaCritico || '', refuerzo: b.retroalimentacionTexto || '',
      vocabulario: (b.vocabulario || []).map((v) => `${v.palabra}: ${v.definicion || ''}`).join('\n'),
      asistente: (b.mensajesChat || []).map((m) => `${m.emisor === 'user' ? 'Alumno' : 'Asistente'}: ${m.texto}`).join('\n'),
    });
  });
  ws.eachRow((row, rowNumber) => {
    row.alignment = { vertical: 'top', wrapText: true };
    if (rowNumber > 1) row.height = 48;
  });
}

function construirFicha({ registros, borradores = [], docente = '', filtros = {} }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Académico Partner';
  wb.created = new Date();
  hojaFicha(wb, registros, docente, filtros);
  hojaResumen(wb, registros);
  hojaBorradores(wb, borradores);
  return wb;
}

module.exports = { construirFicha };
