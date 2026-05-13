const RATING_VALUES = [1, 2, 3, 4, 5]
const QUESTION_CHOICES = ['A', 'B', 'C']
const QUESTION_MARK_MAX = 10
const INTERVIEW_QUESTION_COUNT = 10

const PROFESSIONAL_RATING_FIELDS = [
  { key: 'qualification', label: 'Qualification' },
  { key: 'technicalKnowledge', label: 'Technical Knowledge' },
  { key: 'professionalExperience', label: 'Professional Experience' },
  { key: 'competenceConfidence', label: 'Competence / Confidence' },
  { key: 'maturity', label: 'Maturity' },
  { key: 'adaptability', label: 'Adaptability' },
  { key: 'communicationEngMar', label: 'Communication - Eng / Mar' },
  { key: 'stability', label: 'Stability' }
]

const PERSONALITY_RATING_FIELDS = [
  { key: 'leadership', label: 'Leadership' },
  { key: 'attitude', label: 'Attitude' },
  { key: 'interpersonalSkills', label: 'Interpersonal Skills' },
  { key: 'enthusiasm', label: 'Enthusiasm' },
  { key: 'intelligenceAlertness', label: 'Intelligence / Alertness' },
  { key: 'personalityHonesty', label: 'Personality / Honesty' },
  { key: 'financeStandard', label: 'Finance Standard' },
  { key: 'classOfCandidate', label: 'Class Of Candidate' }
]

const pdfPlainText = (value) =>
  String(value ?? '')
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, '?')
    .replace(/\s+/g, ' ')
    .trim()

const escapePdfText = (value) => pdfPlainText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

const normalizeSelections = (values, allowed) => {
  const selected = new Set((Array.isArray(values) ? values : []).map((item) => String(item)))
  return allowed.filter((item) => selected.has(String(item)))
}

const isSelected = (values, value) => normalizeSelections(values, [value]).length > 0

const normalizeQuestionMarks = (value) => {
  const raw = pdfPlainText(value)
  if (!raw) return ''
  const numeric = Number(raw)
  if (!Number.isFinite(numeric)) return ''
  const clamped = Math.max(0, Math.min(QUESTION_MARK_MAX, numeric))
  return Number.isInteger(clamped) ? String(clamped) : String(clamped)
}

const normalizeQuestionRow = (row = {}) => ({
  question: pdfPlainText(row.question),
  choices: normalizeSelections(row.choices, QUESTION_CHOICES),
  marks: normalizeQuestionMarks(row.marks ?? row.grade)
})

const questionHasContent = (row) => Boolean(pdfPlainText(row.question) || row.choices?.length || normalizeQuestionMarks(row.marks))

const buildQuestionRows = (rows) => {
  const source = Array.isArray(rows) ? rows.map(normalizeQuestionRow) : []
  const lastContentIndex = source.reduce((lastIndex, row, index) => (questionHasContent(row) ? index : lastIndex), -1)
  const targetLength = Math.max(INTERVIEW_QUESTION_COUNT, lastContentIndex + 1)
  return Array.from({ length: targetLength }, (_, index) => source[index] || { question: '', choices: [], marks: '' })
}

const calculateQuestionMarksResult = (questions) => {
  const rows = buildQuestionRows(questions)
  const scores = rows.map((row) => {
    const marks = normalizeQuestionMarks(row.marks)
    if (!marks) return null
    const numeric = Number(marks)
    return Number.isFinite(numeric) ? numeric : null
  })

  return {
    rows,
    scores,
    total: scores.reduce((sum, score) => sum + (Number.isFinite(score) ? score : 0), 0),
    maxTotal: scores.length * QUESTION_MARK_MAX
  }
}

const safeFileName = (value) =>
  String(value || 'candidate')
    .trim()
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'candidate'

const successRemarkPdfFileName = (candidate) =>
  `${safeFileName(candidate?.fullName || candidate?.candidateCode || candidate?._id)}-Success-Interviewer-Remark.pdf`

const generateSuccessRemarkPdf = (candidateDoc) => {
  const candidate = candidateDoc?.toObject ? candidateDoc.toObject() : candidateDoc || {}
  const interviewForm = candidate.interviewForm || {}
  const pageWidth = 842
  const pageHeight = 595
  const margin = 28
  const pages = []
  let ops = []
  let y = margin

  const pdfY = (topY) => pageHeight - topY
  const color = ([r, g, b]) => `${r} ${g} ${b}`
  const add = (value) => ops.push(value)
  const finishPage = () => {
    if (ops.length) pages.push(ops.join('\n'))
    ops = []
    y = margin
  }
  const ensureSpace = (height) => {
    if (y + height > pageHeight - margin) finishPage()
  }
  const drawText = (text, x, topY, { size = 10, bold = false, fill = [0.06, 0.09, 0.16], maxWidth = 120 } = {}) => {
    const lineHeight = size * 1.25
    const words = pdfPlainText(text).split(' ').filter(Boolean)
    const lines = []
    let line = ''
    words.forEach((word) => {
      const next = line ? `${line} ${word}` : word
      if (next.length * size * 0.52 <= maxWidth) {
        line = next
      } else {
        if (line) lines.push(line)
        line = word
      }
    })
    if (line) lines.push(line)
    if (!lines.length) lines.push('')
    lines.forEach((item, index) => {
      add(`BT ${color(fill)} rg /F${bold ? 2 : 1} ${size} Tf ${x.toFixed(2)} ${pdfY(topY + size + index * lineHeight).toFixed(2)} Td (${escapePdfText(item)}) Tj ET`)
    })
    return lines.length * lineHeight
  }
  const drawRect = (x, topY, width, height, { stroke = [0.8, 0.84, 0.9], fill = null, lineWidth = 1 } = {}) => {
    add(`q ${lineWidth} w`)
    if (fill) add(`${color(fill)} rg`)
    if (stroke) add(`${color(stroke)} RG`)
    add(`${x.toFixed(2)} ${(pageHeight - topY - height).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`)
    add('Q')
  }
  const drawLine = (x1, y1, x2, y2, stroke = [0.1, 0.13, 0.2], lineWidth = 1) => {
    add(`q ${lineWidth} w ${color(stroke)} RG ${x1.toFixed(2)} ${pdfY(y1).toFixed(2)} m ${x2.toFixed(2)} ${pdfY(y2).toFixed(2)} l S Q`)
  }
  const drawCheckbox = (x, topY, checked) => {
    drawRect(x, topY, 10, 10, { stroke: [0.45, 0.45, 0.45] })
    if (checked) {
      drawLine(x + 2, topY + 5, x + 4.5, topY + 8, [0.02, 0.48, 0.84], 1.5)
      drawLine(x + 4.5, topY + 8, x + 8.5, topY + 2, [0.02, 0.48, 0.84], 1.5)
    }
  }
  const drawRatingPanel = (title, fields, ratings, x, topY, width) => {
    const headerHeight = 45
    const tableHeaderHeight = 26
    const rowHeight = 24
    const height = headerHeight + tableHeaderHeight + fields.length * rowHeight
    drawRect(x, topY, width, height, { stroke: [0.83, 0.88, 0.94] })
    drawRect(x, topY, width, headerHeight, { stroke: [0.83, 0.88, 0.94], fill: [0.97, 0.98, 0.99] })
    drawText(title, x + 12, topY + 10, { size: 11, bold: true, maxWidth: width - 24 })
    drawText('Rate following parameters: 1 lowest and 5 highest', x + 12, topY + 27, { size: 8.5, fill: [0.33, 0.42, 0.55], maxWidth: width - 24 })

    const srW = 36
    const scoreW = 36
    const paramW = width - srW - scoreW * RATING_VALUES.length
    let rowY = topY + headerHeight
    drawText('SR.', x + 12, rowY + 8, { size: 8.5, bold: true, fill: [0.39, 0.48, 0.61], maxWidth: srW })
    drawText('PARAMETERS', x + srW + 8, rowY + 8, { size: 8.5, bold: true, fill: [0.39, 0.48, 0.61], maxWidth: paramW })
    RATING_VALUES.forEach((value, index) => {
      drawText(value, x + srW + paramW + index * scoreW + 14, rowY + 8, { size: 8.5, bold: true, fill: [0.39, 0.48, 0.61], maxWidth: scoreW })
    })
    rowY += tableHeaderHeight
    fields.forEach((field, index) => {
      if (index % 2 === 1) drawRect(x, rowY, width, rowHeight, { stroke: null, fill: [0.97, 0.98, 0.99] })
      drawLine(x, rowY, x + width, rowY, [0.93, 0.95, 0.97], 0.6)
      drawText(index + 1, x + 12, rowY + 7, { size: 9, fill: [0.39, 0.48, 0.61], maxWidth: srW })
      drawText(field.label, x + srW + 8, rowY + 7, { size: 9.2, bold: true, maxWidth: paramW - 10 })
      RATING_VALUES.forEach((value, scoreIndex) => {
        drawCheckbox(x + srW + paramW + scoreIndex * scoreW + 13, rowY + 7, isSelected(ratings?.[field.key], value))
      })
      rowY += rowHeight
    })
    return height
  }
  const drawFieldGrid = (topY) => {
    const fields = [
      ['Suitable Industry', interviewForm.suitableIndustry],
      ['Suitable Department', interviewForm.suitableDepartment],
      ['HR Interviewer', interviewForm.hrInterviewer],
      ['Remark', interviewForm.remark]
    ]
    const gap = 16
    const colW = (pageWidth - margin * 2 - gap * 2) / 3
    fields.forEach(([label, value], index) => {
      const row = Math.floor(index / 3)
      const col = index % 3
      const x = margin + col * (colW + gap)
      const fieldY = topY + row * 55
      drawText(label, x, fieldY, { size: 10, bold: true, fill: [0.2, 0.28, 0.39], maxWidth: colW })
      drawRect(x, fieldY + 18, colW, 32, { stroke: [0.78, 0.83, 0.9] })
      drawText(value, x + 8, fieldY + 27, { size: 9, bold: true, maxWidth: colW - 16 })
    })
    return 110
  }
  const drawQuestions = () => {
    const rows = buildQuestionRows(interviewForm.questions)
    const result = calculateQuestionMarksResult(interviewForm.questions)
    const questionRowStartOffset = 98
    const questionRowHeight = 25
    const questionBottomPadding = 16
    const questionHeight = questionRowStartOffset + rows.length * questionRowHeight + questionBottomPadding
    ensureSpace(questionHeight + 66)
    drawRect(margin, y, pageWidth - margin * 2, questionHeight, { stroke: [0.06, 0.09, 0.16], lineWidth: 1.4 })
    drawText('Candidate Name -', margin + 18, y + 24, { size: 12, bold: true, maxWidth: 115 })
    drawText(candidate.fullName, margin + 145, y + 24, { size: 10.5, bold: true, maxWidth: pageWidth - margin * 2 - 170 })
    drawLine(margin + 145, y + 42, pageWidth - margin - 18, y + 42, [0.06, 0.09, 0.16], 1)
    const titleW = 160
    drawRect((pageWidth - titleW) / 2, y + 62, titleW, 22, { stroke: [0.06, 0.09, 0.16], fill: [0.06, 0.09, 0.16] })
    drawText('Interview Questions', (pageWidth - titleW) / 2 + 8, y + 66, { size: 12, bold: true, fill: [1, 1, 1], maxWidth: titleW - 16 })
    let rowY = y + questionRowStartOffset
    rows.forEach((row, index) => {
      drawText(`${index + 1}.`, margin + 18, rowY + 5, { size: 10, bold: true, maxWidth: 26 })
      drawText(row.question, margin + 52, rowY + 5, { size: 9, bold: true, maxWidth: pageWidth - margin * 2 - 210 })
      drawLine(margin + 52, rowY + 21, pageWidth - margin - 150, rowY + 21, [0.06, 0.09, 0.16], 0.8)
      const choiceX = pageWidth - margin - 138
      QUESTION_CHOICES.forEach((choice, choiceIndex) => {
        const x = choiceX + choiceIndex * 46
        drawRect(x, rowY, 46, 22, { stroke: [0.06, 0.09, 0.16] })
        drawCheckbox(x + 10, rowY + 6, isSelected(row.choices, choice))
        drawText(choice, x + 25, rowY + 5, { size: 9, bold: true, maxWidth: 15 })
      })
      rowY += questionRowHeight
    })
    y += questionHeight + 18

    const columns = result.rows.length + 2
    const tableW = pageWidth - margin * 2
    const cellW = tableW / columns
    const tableY = y
    drawRect(margin, tableY, tableW, 48, { stroke: [0.06, 0.09, 0.16], lineWidth: 1 })
    drawLine(margin, tableY + 24, margin + tableW, tableY + 24)
    Array.from({ length: columns + 1 }, (_, index) => margin + index * cellW).forEach((x) => drawLine(x, tableY, x, tableY + 48))
    drawText('IQ', margin + 10, tableY + 7, { size: 10.5, bold: true, maxWidth: cellW - 20 })
    result.rows.forEach((_row, index) => drawText(index + 1, margin + (index + 1) * cellW + cellW / 2 - 4, tableY + 7, { size: 10.5, bold: true, maxWidth: cellW - 8 }))
    drawText('TQ', margin + (columns - 1) * cellW + 10, tableY + 7, { size: 10.5, bold: true, maxWidth: cellW - 20 })
    drawText('Marks', margin + 8, tableY + 31, { size: 10.5, bold: true, maxWidth: cellW - 16 })
    result.rows.forEach((row, index) => drawText(row.marks, margin + (index + 1) * cellW + cellW / 2 - 6, tableY + 31, { size: 9.5, bold: true, maxWidth: cellW - 8 }))
    drawText(`${result.total}/${result.maxTotal}`, margin + (columns - 1) * cellW + 8, tableY + 31, { size: 9.5, bold: true, maxWidth: cellW - 16 })
    y += 64
  }

  drawText('Success Interviewer Remark', margin, y, { size: 16, bold: true, maxWidth: 360 })
  y += 29
  drawLine(margin, y, pageWidth - margin, y, [0.89, 0.92, 0.96], 0.8)
  y += 22
  const gap = 16
  const panelW = (pageWidth - margin * 2 - gap) / 2
  const panelHeight = drawRatingPanel('Professional Assessment', PROFESSIONAL_RATING_FIELDS, interviewForm.professionalRatings, margin, y, panelW)
  drawRatingPanel('Personality Assessment', PERSONALITY_RATING_FIELDS, interviewForm.personalityRatings, margin + panelW + gap, y, panelW)
  y += panelHeight + 20
  ensureSpace(110)
  y += drawFieldGrid(y) + 12
  drawQuestions()
  finishPage()

  const objects = [
    null,
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_page, index) => `${5 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'
  ]
  pages.forEach((content, index) => {
    const pageObject = 5 + index * 2
    const contentObject = pageObject + 1
    objects[pageObject] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObject} 0 R >>`
    objects[contentObject] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  })

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (let i = 1; i < objects.length; i += 1) {
    offsets[i] = pdf.length
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`
  }
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let i = 1; i < objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`

  return Buffer.from(pdf, 'ascii')
}

module.exports = {
  generateSuccessRemarkPdf,
  successRemarkPdfFileName
}
