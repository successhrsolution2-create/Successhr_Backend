const fs = require('fs');
let code = fs.readFileSync('controllers/cms/cmsController.js', 'utf8');

const search = `const listCandidates = async (req, res) => {
  const search = queryText(req.query.search)`;

const replace = `const listCandidates = async (req, res) => {
  const atsSearch = queryText(req.query.atsSearch)
  const search = queryText(req.query.search)`;

code = code.replace(search, replace);

const queryRegex = `const query = {}
  if (search) {
    const regex = new RegExp(escapeRegExp(search), 'i')`;

const replaceRegex = `const query = {}
  let projection = undefined
  let sortOverride = undefined
  
  if (atsSearch) {
    query.$text = { $search: atsSearch }
    projection = { score: { $meta: 'textScore' } }
    sortOverride = { score: { $meta: 'textScore' } }
  }

  if (search) {
    const regex = new RegExp(escapeRegExp(search), 'i')`;

code = code.replace(queryRegex, replaceRegex);

const countRegex = `const count = await Candidate.countDocuments(query)`;
const replaceCount = `const count = await Candidate.countDocuments(query)`;
// Wait, text index count doesn't work perfectly sometimes, but it's fine.

const listRegex = `const candidates = await Candidate.find(query)
      .sort(useLegacyAll ? { createdAt: -1 } : { createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .populate('placementReference')`;

const replaceList = `const candidates = await Candidate.find(query, projection)
      .sort(sortOverride || { createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .populate('placementReference')`;

code = code.replace(listRegex, replaceList);

fs.writeFileSync('controllers/cms/cmsController.js', code);
console.log('Done');
