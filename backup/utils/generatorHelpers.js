const { addCursorRows } = require('./streamer')
const {
  autoFitColumns,
  styleDataRows,
  styleHeaderRow
} = require('./excel.builder')

const endOfDay = (value) => {
  const date = new Date(value)
  date.setUTCHours(23, 59, 59, 999)
  return date
}

const dateRangeMatch = (fromDate, toDate, field = 'createdAt') => ({
  [field]: {
    $gte: new Date(fromDate),
    $lte: endOfDay(toDate)
  }
})

const joinValues = (value) => {
  if (!Array.isArray(value)) return value || ''
  return value.filter(Boolean).join(', ')
}

const yesNo = (value) => (value ? 'Yes' : 'No')

const idString = (value) => {
  if (!value) return ''
  return value._id ? String(value._id) : String(value)
}

const addWorksheetFromCursor = async ({
  workbook,
  name,
  columns,
  cursor,
  mapRow,
  tabColor = 'FF0070C0',
  autoFilterTo
}) => {
  const worksheet = workbook.addWorksheet(name, {
    properties: { tabColor: { argb: tabColor } },
    views: [{ state: 'frozen', ySplit: 1 }]
  })

  worksheet.columns = columns
  styleHeaderRow(worksheet)

  const count = await addCursorRows(worksheet, cursor, mapRow)
  styleDataRows(worksheet, 2, worksheet.rowCount)
  autoFitColumns(worksheet)

  if (autoFilterTo) {
    worksheet.autoFilter = { from: 'A1', to: autoFilterTo }
  }

  return { worksheet, count }
}

const addSummaryRows = ({ workbook, name, columns, rows, tabColor = 'FF00B050', autoFilterTo }) => {
  const worksheet = workbook.addWorksheet(name, {
    properties: { tabColor: { argb: tabColor } },
    views: [{ state: 'frozen', ySplit: 1 }]
  })

  worksheet.columns = columns
  styleHeaderRow(worksheet)
  rows.forEach((row) => worksheet.addRow(row))
  styleDataRows(worksheet, 2, worksheet.rowCount)
  autoFitColumns(worksheet)

  if (autoFilterTo) {
    worksheet.autoFilter = { from: 'A1', to: autoFilterTo }
  }

  return worksheet
}

module.exports = {
  addSummaryRows,
  addWorksheetFromCursor,
  dateRangeMatch,
  endOfDay,
  idString,
  joinValues,
  yesNo
}
