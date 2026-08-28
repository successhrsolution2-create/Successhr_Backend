const mongoose = require('mongoose');
const CmsCandidate = require('./models/cms/CmsCandidate');

mongoose.connect('mongodb://127.0.0.1:27017/successhr').then(async () => {
  const candidate = await CmsCandidate.findOne({ 'candidatePortal.passwordHash': { $exists: true } });
  if (!candidate) {
    console.log('No candidate found with passwordHash');
    process.exit(0);
  }
  console.log('Before:', candidate.candidatePortal);

  const reqBody = { fullName: 'Updated Name ' + Date.now() };
  Object.entries(reqBody).forEach(([k, v]) => {
    if (k !== 'candidatePassword') {
      candidate[k] = v;
      candidate.markModified(k);
    }
  });

  await candidate.save();

  const after = await CmsCandidate.findById(candidate._id).select('+candidatePortal.passwordHash');
  console.log('After:', after.candidatePortal);
  process.exit(0);
});
