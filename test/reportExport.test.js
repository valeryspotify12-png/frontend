import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildReportPdfDocument,
  buildReportWorkbook,
  prepareReportExport,
} from '../src/utils/reportExport.js'

test('prepares complete crop report rows and aggregate summary values', () => {
  const input = Array.from({ length: 1250 }, (_, index) => ({
    id: index + 1,
    cultivo: `Cultivo ${index + 1}`,
    estado: 'En proceso',
    total_produccion: 10,
    total_costos: 4,
    total_ingresos: 15,
    ganancia: 11,
  }))
  const report = prepareReportExport('por-cultivo', input)

  assert.equal(report.rows.length, 1250)
  assert.equal(report.rows[0].cultivo, 'Cultivo 1')
  assert.deepEqual(report.summary.map((item) => item.value), [1250, 12500, 5000, 18750, 13750])
})

test('exports production line details with income calculated from quantity and unit price', () => {
  const report = prepareReportExport('produccion', [
    { cultivo: 'Banano', cantidad: '12.5', unidad: 'kg', fecha: '2026-10-01', precio_unitario: '800' },
  ])

  assert.deepEqual(report.rows[0], {
    cultivo: 'Banano',
    cantidad: 12.5,
    unidad: 'kg',
    fecha: '2026-10-01',
    precio: 800,
    ingreso: 10000,
  })
})

test('rejects unknown report types rather than producing an incomplete file', () => {
  assert.throws(() => prepareReportExport('unknown', []), /Tipo de reporte no compatible/)
})

test('creates a workbook with separate summary and complete detail sheets', async () => {
  const input = Array.from({ length: 1250 }, (_, index) => ({
    cultivo: `Cultivo ${index + 1}`,
    estado: 'En proceso',
    total_produccion: 10,
    total_costos: 4,
    total_ingresos: 15,
    ganancia: 11,
  }))
  const workbook = await buildReportWorkbook('por-cultivo', input, [{ label: 'Finca', value: 'Monterey' }])
  const XLSX = await import('xlsx')
  const details = workbook.Sheets.Detalle
  const range = XLSX.utils.decode_range(details['!ref'])

  assert.deepEqual(workbook.SheetNames, ['Detalle', 'Resumen'])
  assert.equal(details.A1.v, 'Cultivo')
  assert.equal(details.A2.v, 'Cultivo 1')
  assert.equal(details.A1251.v, 'Cultivo 1250')
  assert.equal(range.e.r, 1250)
  assert.equal(details['!autofilter'].ref, 'A1:F1251')
  assert.equal(workbook.Sheets.Resumen.B5.v, 'Monterey')
})

test('creates a multi-page, text-based PDF document containing the full detail rows', async () => {
  const rows = Array.from({ length: 100 }, (_, index) => ({
    categoria: 'Mano de Obra',
    subcategoria: 'Jornales',
    cultivo: `Cultivo ${index + 1}`,
    descripcion: 'Trabajo de campo',
    valor: 1000,
    fecha: '2026-10-01',
  }))
  const pdf = await buildReportPdfDocument('costos', rows, [{ label: 'Finca', value: 'Monterey' }])

  assert.ok(pdf.internal.getNumberOfPages() > 1)
  assert.ok(pdf.output('arraybuffer').byteLength > 0)
})
