const { sanitizeRow } = require('./sanitizer')

const addCursorRows = async (worksheet, cursor, mapDocumentToRow, options = {}) => {
  const maxRows = Number(options.maxRows || 50000)
  let count = 0

  for await (const document of cursor) {
    count += 1
    if (count > maxRows) {
      const error = new Error(`Sheet row limit exceeded. Maximum allowed rows: ${maxRows}`)
      error.statusCode = 413
      throw error
    }

    worksheet.addRow(sanitizeRow(mapDocumentToRow(document, count)))
  }

  return count
}

module.exports = { addCursorRows }
