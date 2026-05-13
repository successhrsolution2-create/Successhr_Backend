const { validateImageUploadFile, validateUploadFile } = require('../../utils/fileValidation')

const pdf = Buffer.from('%PDF-1.4 test')
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00])

const file = (overrides = {}) => ({
  originalname: 'resume.pdf',
  mimetype: 'application/pdf',
  size: pdf.length,
  buffer: pdf,
  ...overrides
})

describe('file upload security validation', () => {
  test('rejects executable files', () => {
    expect(() =>
      validateUploadFile(
        file({
          originalname: 'virus.exe',
          mimetype: 'application/octet-stream',
          buffer: Buffer.from('MZ...')
        })
      )
    ).toThrow(/allowed/i)
  })

  test('rejects disguised double-extension script uploads', () => {
    expect(() =>
      validateUploadFile(
        file({
          originalname: 'photo.jpg.php',
          mimetype: 'image/jpeg',
          buffer: Buffer.from('<?php echo 1; ?>')
        })
      )
    ).toThrow(/extension|content/i)
  })

  test('rejects files larger than 5MB', () => {
    expect(() =>
      validateUploadFile(
        file({
          size: 6 * 1024 * 1024,
          buffer: Buffer.concat([pdf, Buffer.alloc(6 * 1024 * 1024)])
        })
      )
    ).toThrow(/size/i)
  })

  test('rejects MIME/signature mismatch', () => {
    expect(() =>
      validateUploadFile(
        file({
          originalname: 'image.png',
          mimetype: 'image/png',
          size: png.length,
          buffer: pdf
        })
      )
    ).toThrow(/content/i)
  })

  test('accepts valid PDF and PNG signatures', () => {
    expect(() => validateUploadFile(file())).not.toThrow()
    expect(() =>
      validateUploadFile(
        file({
          originalname: 'image.png',
          mimetype: 'image/png',
          size: png.length,
          buffer: png
        })
      )
    ).not.toThrow()
  })

  test('rejects PDFs for public candidate document image uploads', () => {
    expect(() => validateImageUploadFile(file())).toThrow(/image/i)
  })
})
