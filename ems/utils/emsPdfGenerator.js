const escapePdfText = (value) =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')

const buildPdf = (lines) => {
  const content = [
    'BT',
    '/F1 18 Tf',
    '50 780 Td',
    ...lines.flatMap((line, index) => {
      const size = index === 0 ? 18 : 10
      return [`/F1 ${size} Tf`, `(${escapePdfText(line)}) Tj`, '0 -20 Td']
    }),
    'ET'
  ].join('\n')

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
  ]

  let body = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body))
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = Buffer.byteLength(body)
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  offsets.slice(1).forEach((offset) => {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return Buffer.from(body)
}

const generatePayslipPdf = ({ payroll, employee }) => {
  const companyName = process.env.EMS_COMPANY_NAME || 'Your Company Name'
  const lines = [
    `${companyName} - Payslip`,
    `Employee: ${employee?.fullName || employee?.employeeId || 'Employee'}`,
    `Employee ID: ${employee?.employeeId || '-'}`,
    `Period: ${String(payroll.month).padStart(2, '0')}/${payroll.year}`,
    `Gross Pay: ${payroll.grossPay || 0}`,
    `Deductions: ${payroll.totalDeductions || 0}`,
    `Net Pay: ${payroll.netPay || 0}`,
    `Status: ${payroll.status || 'Draft'}`,
    '',
    'This payslip is system generated.'
  ]
  return buildPdf(lines)
}

module.exports = { generatePayslipPdf }
