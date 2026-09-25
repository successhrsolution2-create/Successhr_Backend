const fs = require('fs');
let code = fs.readFileSync('controllers/cms/cmsController.js', 'utf8');

if (!code.includes('pdf-parse')) {
  code = code.replace(
    "const { uploadToS3, getObjectFromS3, deleteFromS3 } = require('../../utils/s3Upload')",
    "const { uploadToS3, getObjectFromS3, deleteFromS3 } = require('../../utils/s3Upload')\nconst pdfParse = require('pdf-parse')"
  );

  const search = `  const fileUrl = await uploadToS3(req.file, 'candidate-documents')
  candidate.documents = candidate.documents || []
  candidate.documents.push({
    documentType,`;

  const replace = `  const fileUrl = await uploadToS3(req.file, 'candidate-documents')
  
  let extractedText = ''
  if (documentType === 'updatedResume' && req.file.mimetype === 'application/pdf') {
    try {
      const pdfData = await pdfParse(req.file.buffer)
      extractedText = pdfData.text || ''
    } catch (err) {
      console.error('Failed to parse resume PDF in CMS', err)
    }
  }

  candidate.documents = candidate.documents || []
  candidate.documents.push({
    extractedText,
    documentType,`;

  code = code.replace(search, replace);

  const search2 = `    size: req.file.size,
    uploadedAt: new Date()
  })`;

  const replace2 = `    size: req.file.size,
    uploadedAt: new Date()
  })

  if (extractedText) {
    candidate.resumeText = extractedText
  }`;

  code = code.replace(search2, replace2);

  fs.writeFileSync('controllers/cms/cmsController.js', code);
  console.log('Done');
} else {
  console.log('Already added');
}
