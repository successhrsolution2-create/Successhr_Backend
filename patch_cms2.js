const fs = require('fs');
let code = fs.readFileSync('controllers/cms/cmsController.js', 'utf8');

// Find the line that says: const candidates = await CmsCandidate.find(query)
const search = `    if (useLegacyAll) {
      const candidates = await CmsCandidate.find(query)`;

const replace = `    if (useLegacyAll) {
      const candidates = await CmsCandidate.find(query, projection)`;
      
code = code.replace(search, replace);

const search2 = `      CmsCandidate.find(query)
        .populate('advisor', 'name email advisorCode')
        .sort({ createdAt: -1 })`;

const replace2 = `      CmsCandidate.find(query, projection)
        .populate('advisor', 'name email advisorCode')
        .sort(sortOverride || { createdAt: -1 })`;

code = code.replace(search2, replace2);

fs.writeFileSync('controllers/cms/cmsController.js', code);
console.log('Sorting fixed');
