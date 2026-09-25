const fs = require('fs');
let cmsCode = fs.readFileSync('controllers/cms/cmsController.js', 'utf8');

// Also inject 'fs' module if not exists
if (!cmsCode.includes("const fs = require('fs')")) {
  cmsCode = "const fs = require('fs')\n" + cmsCode;
}

cmsCode = cmsCode.replace(
  "const pdfData = await pdfParse(req.file.buffer)",
  "const pdfData = await pdfParse(req.file.buffer || fs.readFileSync(req.file.path))"
);

fs.writeFileSync('controllers/cms/cmsController.js', cmsCode);

let publicCode = fs.readFileSync('controllers/publicController.js', 'utf8');
if (!publicCode.includes("const fs = require('fs')")) {
  publicCode = "const fs = require('fs')\n" + publicCode;
}

publicCode = publicCode.replace(
  "const pdfData = await pdfParse(file.buffer)",
  "const pdfData = await pdfParse(file.buffer || fs.readFileSync(file.path))"
);

fs.writeFileSync('controllers/publicController.js', publicCode);
console.log('Fixed buffer reading');
