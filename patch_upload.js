const fs = require('fs');
let code = fs.readFileSync('controllers/publicController.js', 'utf8');

if (!code.includes('pdf-parse')) {
  code = code.replace("const { uploadToS3 } = require('../utils/s3Upload')", "const { uploadToS3 } = require('../utils/s3Upload')\nconst pdfParse = require('pdf-parse')");
}

code = code.replace(
  "const fileUrl = await uploadToS3(file, 'candidate-documents')\n      documents.push({",
  `const fileUrl = await uploadToS3(file, 'candidate-documents')
      
      let extractedText = ''
      if (documentType === 'updatedResume' && file.mimetype === 'application/pdf') {
        try {
          const pdfData = await pdfParse(file.buffer)
          extractedText = pdfData.text || ''
        } catch (err) {
          console.error('Failed to parse resume PDF', err)
        }
      }

      documents.push({
        extractedText,`
);

code = code.replace(
  "if (uploadedDocuments.length) {\n    candidate.documents = [...(candidate.documents || []), ...uploadedDocuments]\n  }",
  `if (uploadedDocuments.length) {
    candidate.documents = [...(candidate.documents || []), ...uploadedDocuments]
    const resumeDoc = uploadedDocuments.find(d => d.documentType === 'updatedResume' && d.extractedText)
    if (resumeDoc) {
      candidate.resumeText = resumeDoc.extractedText
    }
  }`
);

code = code.replace(
  "payload.documents = await uploadApplicationDocuments(req.files)",
  `payload.documents = await uploadApplicationDocuments(req.files)
  const resumeDoc = payload.documents.find(d => d.documentType === 'updatedResume' && d.extractedText)
  if (resumeDoc) {
    payload.resumeText = resumeDoc.extractedText
  }`
);

fs.writeFileSync('controllers/publicController.js', code);
console.log('Done');
