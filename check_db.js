const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/successhr').then(async () => {
  const collections = await mongoose.connection.db.collections();
  const CmsCandidate = collections.find(c => c.collectionName === 'cms_candidates');
  if (CmsCandidate) {
    const candidate = await CmsCandidate.findOne({ 'documents.fileName': /Sahil_Shaikh/i });
    if (candidate) {
      console.log('Found candidate:', candidate.fullName);
      console.log('resumeText length:', candidate.resumeText ? candidate.resumeText.length : 0);
      const resumeDoc = (candidate.documents || []).find(d => d.documentType === 'updatedResume');
      console.log('extractedText length in doc:', resumeDoc && resumeDoc.extractedText ? resumeDoc.extractedText.length : 0);
    } else {
      console.log('Candidate not found');
    }
  }
  mongoose.disconnect();
}).catch(console.error);
