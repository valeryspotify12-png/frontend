const REPORT_DEFINITIONS = {
  'por-cultivo': {
    title: 'Reporte por Cultivo',
    columns: [
      { key: 'cultivo', header: 'Cultivo', type: 'text' },
      { key: 'estado', header: 'Estado', type: 'text' },
      { key: 'produccion', header: 'Producción (kg)', type: 'number' },
      { key: 'costos', header: 'Costos (COP)', type: 'currency' },
      { key: 'ingresos', header: 'Ingresos (COP)', type: 'currency' },
      { key: 'ganancia', header: 'Ganancia (COP)', type: 'currency' },
    ],
    mapRow: (row) => {
      const ingresos = Number(row.total_ingresos) || 0
      const costos = Number(row.total_costos) || 0
      return {
        cultivo: row.cultivo || '--',
        estado: row.estado || '--',
        produccion: Number(row.total_produccion) || 0,
        costos,
        ingresos,
        ganancia: Number(row.ganancia ?? ingresos - costos),
      }
    },
    summarize: (rows) => [
      { label: 'Total de cultivos', value: rows.length, type: 'number' },
      { label: 'Producción total (kg)', value: sum(rows, 'produccion'), type: 'number' },
      { label: 'Costos totales (COP)', value: sum(rows, 'costos'), type: 'currency' },
      { label: 'Ingresos totales (COP)', value: sum(rows, 'ingresos'), type: 'currency' },
      { label: 'Ganancia total (COP)', value: sum(rows, 'ganancia'), type: 'currency' },
    ],
  },
  costos: {
    title: 'Reporte de Costos',
    columns: [
      { key: 'categoria', header: 'Categoría', type: 'text' },
      { key: 'subcategoria', header: 'Subcategoría', type: 'text' },
      { key: 'cultivo', header: 'Cultivo', type: 'text' },
      { key: 'descripcion', header: 'Descripción', type: 'text' },
      { key: 'valor', header: 'Monto (COP)', type: 'currency' },
      { key: 'fecha', header: 'Fecha', type: 'date' },
    ],
    mapRow: (row) => ({
      categoria: row.categoria || '--',
      subcategoria: row.subcategoria || '--',
      cultivo: row.cultivo || '--',
      descripcion: row.descripcion || '--',
      valor: Number(row.valor) || 0,
      fecha: row.fecha || '--',
    }),
    summarize: (rows) => [
      { label: 'Registros de costos', value: rows.length, type: 'number' },
      { label: 'Monto total (COP)', value: sum(rows, 'valor'), type: 'currency' },
    ],
  },
  produccion: {
    title: 'Reporte de Producción',
    columns: [
      { key: 'cultivo', header: 'Cultivo', type: 'text' },
      { key: 'cantidad', header: 'Cantidad', type: 'number' },
      { key: 'unidad', header: 'Unidad', type: 'text' },
      { key: 'fecha', header: 'Fecha de cosecha', type: 'date' },
      { key: 'precio', header: 'Precio unitario (COP)', type: 'currency' },
      { key: 'ingreso', header: 'Ingreso (COP)', type: 'currency' },
    ],
    mapRow: (row) => {
      const cantidad = Number(row.cantidad) || 0
      const precio = Number(row.precio_unitario) || 0
      return {
        cultivo: row.cultivo || '--',
        cantidad,
        unidad: row.unidad || 'kg',
        fecha: row.fecha || '--',
        precio,
        ingreso: cantidad * precio,
      }
    },
    summarize: (rows) => [
      { label: 'Cosechas registradas', value: rows.length, type: 'number' },
      { label: 'Producción total', value: sum(rows, 'cantidad'), type: 'number' },
      { label: 'Ingresos estimados (COP)', value: sum(rows, 'ingreso'), type: 'currency' },
    ],
  },
  rentabilidad: {
    title: 'Reporte de Rentabilidad',
    columns: [
      { key: 'cultivo', header: 'Cultivo', type: 'text' },
      { key: 'ingresos', header: 'Ingresos (COP)', type: 'currency' },
      { key: 'costos', header: 'Costos (COP)', type: 'currency' },
      { key: 'ganancia', header: 'Ganancia (COP)', type: 'currency' },
      { key: 'margen', header: 'Margen (%)', type: 'percent' },
    ],
    mapRow: (row) => {
      const ingresos = Number(row.total_ingresos) || 0
      const costos = Number(row.total_costos) || 0
      const ganancia = Number(row.ganancia ?? ingresos - costos)
      return {
        cultivo: row.cultivo || '--',
        ingresos,
        costos,
        ganancia,
        margen: ingresos ? (ganancia / ingresos) * 100 : 0,
      }
    },
    summarize: (rows) => {
      const ingresos = sum(rows, 'ingresos')
      const ganancia = sum(rows, 'ganancia')
      return [
        { label: 'Cultivos analizados', value: rows.length, type: 'number' },
        { label: 'Ingresos totales (COP)', value: ingresos, type: 'currency' },
        { label: 'Costos totales (COP)', value: sum(rows, 'costos'), type: 'currency' },
        { label: 'Ganancia total (COP)', value: ganancia, type: 'currency' },
        { label: 'Margen global (%)', value: ingresos ? (ganancia / ingresos) * 100 : 0, type: 'percent' },
      ]
    },
  },
  trabajador: {
    title: 'Reporte por Trabajador',
    columns: [
      { key: 'nombre', header: 'Trabajador', type: 'text' },
      { key: 'total_costos', header: 'Costos registrados (COP)', type: 'currency' },
      { key: 'cultivos', header: 'Cultivos asignados', type: 'number' },
    ],
    mapRow: (row) => ({
      nombre: row.nombre || '--',
      total_costos: Number(row.total_costos) || 0,
      cultivos: Number(row.cultivos_asignados) || 0,
    }),
    summarize: (rows) => [
      { label: 'Trabajadores', value: rows.length, type: 'number' },
      { label: 'Costos asociados (COP)', value: sum(rows, 'total_costos'), type: 'currency' },
      { label: 'Cultivos asignados', value: sum(rows, 'cultivos'), type: 'number' },
    ],
  },
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0)
}

export function prepareReportExport(reportType, reportData) {
  const definition = REPORT_DEFINITIONS[reportType]
  if (!definition) throw new Error(`Tipo de reporte no compatible con exportación: ${reportType}`)

  const rows = (Array.isArray(reportData) ? reportData : []).map(definition.mapRow)
  return {
    title: definition.title,
    columns: definition.columns,
    rows,
    summary: definition.summarize(rows),
  }
}

function formatValue(value, type) {
  if (type === 'currency') {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(Number(value) || 0)
  }
  if (type === 'percent') return `${(Number(value) || 0).toFixed(1)}%`
  if (type === 'number') {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(Number(value) || 0)
  }
  return value == null || value === '' ? '--' : String(value)
}

function getFileName(reportType, extension) {
  return `reporte-${reportType}-${new Date().toISOString().slice(0, 10)}.${extension}`
}

export async function buildReportPdfDocument(reportType, reportData, filters = []) {
  const report = prepareReportExport(reportType, reportData)
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const generatedAt = new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date())

  doc.setProperties({ title: report.title, subject: 'Reporte del módulo de costos' })
  doc.setFontSize(8)
  doc.setTextColor(90)
  doc.text(`Generado: ${generatedAt}`, 10, 20)

  let startY = 27
  if (filters.length > 0) {
    doc.setFontSize(8)
    doc.setTextColor(55)
    const filterText = `Filtros aplicados: ${filters.map(({ label, value }) => `${label}: ${value}`).join(' | ')}`
    const filterLines = doc.splitTextToSize(filterText, pageWidth - 20)
    doc.text(filterLines, 10, startY)
    startY += filterLines.length * 4 + 3
  }

  const summaryText = report.summary
    .map(({ label, value, type }) => `${label}: ${formatValue(value, type)}`)
    .join('     |     ')
  const summaryLines = doc.splitTextToSize(summaryText, pageWidth - 20)
  doc.setFontSize(8)
  doc.setTextColor(35, 73, 53)
  doc.text(summaryLines, 10, startY)
  startY += summaryLines.length * 4 + 4

  autoTable(doc, {
    startY,
    head: [report.columns.map((column) => column.header)],
    body: report.rows.length
      ? report.rows.map((row) => report.columns.map((column) => formatValue(row[column.key], column.type)))
      : [[{ content: 'Sin resultados para los filtros seleccionados', colSpan: report.columns.length }]],
    theme: 'grid',
    margin: { top: 27, right: 10, bottom: 17, left: 10 },
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
    headStyles: { fillColor: [35, 73, 53], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [242, 247, 243] },
    columnStyles: Object.fromEntries(
      report.columns.flatMap((column, index) =>
        ['currency', 'number', 'percent'].includes(column.type) ? [[index, { halign: 'right' }]] : []
      )
    ),
    didDrawPage: () => {
      const pageHeight = doc.internal.pageSize.getHeight()
      doc.setFontSize(8)
      doc.setTextColor(35, 73, 53)
      doc.text(report.title, 10, 14)
      doc.setTextColor(100)
      doc.text(`Página ${doc.internal.getCurrentPageInfo().pageNumber}`, pageWidth - 10, pageHeight - 7, { align: 'right' })
    },
  })

  return doc
}

export async function exportReportToPdf(reportType, reportData, filters = []) {
  const doc = await buildReportPdfDocument(reportType, reportData, filters)
  doc.save(getFileName(reportType, 'pdf'))
}

export async function buildReportWorkbook(reportType, reportData, filters = []) {
  const report = prepareReportExport(reportType, reportData)
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()
  const generatedAt = new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date())
  const summaryRows = [
    [report.title],
    ['Generado', generatedAt],
    [],
    ['Filtros aplicados'],
    ...filters.map(({ label, value }) => [label, value]),
    [],
    ['Resumen'],
    ...report.summary.map(({ label, value }) => [label, value]),
  ]
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows)
  summarySheet['!cols'] = [{ wch: 34 }, { wch: 42 }]
  summarySheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]
  const summaryStartRow = 7 + filters.length
  report.summary.forEach((item, index) => {
    const cell = summarySheet[`B${summaryStartRow + index}`]
    if (!cell) return
    cell.z = item.type === 'currency' ? '"$"#,##0' : item.type === 'percent' ? '0.0"%"' : '#,##0.##'
  })
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen')

  const headerRow = 3
  const detailRows = [
    [report.title],
    ['Generado', generatedAt],
    [],
    report.columns.map((column) => column.header),
    ...report.rows.map((row) => report.columns.map((column) => row[column.key])),
  ]
  const detailSheet = XLSX.utils.aoa_to_sheet(detailRows)
  detailSheet['!cols'] = report.columns.map((column) => ({
    wch: Math.min(42, Math.max(column.header.length + 2, ...report.rows.map((row) => String(row[column.key] ?? '').length + 2), 12)),
  }))
  if (report.rows.length > 0) {
    report.columns.forEach((column, columnIndex) => {
      if (!['currency', 'number', 'percent'].includes(column.type)) return
      for (let rowIndex = headerRow + 1; rowIndex <= headerRow + report.rows.length; rowIndex += 1) {
        const cell = detailSheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })]
        if (cell) {
          cell.z = column.type === 'currency' ? '"$"#,##0' : column.type === 'percent' ? '0.0"%"' : '#,##0.##'
        }
      }
    })
  }
  detailSheet['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: headerRow, c: 0 },
      e: { r: headerRow + report.rows.length, c: report.columns.length - 1 },
    }),
  }
  XLSX.utils.book_append_sheet(workbook, detailSheet, 'Detalle')
  return workbook
}

export async function exportReportToExcel(reportType, reportData, filters = []) {
  const XLSX = await import('xlsx')
  const workbook = await buildReportWorkbook(reportType, reportData, filters)
  XLSX.writeFile(workbook, getFileName(reportType, 'xlsx'))
}
