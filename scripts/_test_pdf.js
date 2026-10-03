const { PDFParse } = require('pdf-parse');
const fs = require('fs');

async function run() {
  const buf = fs.readFileSync('dist_test/templates/test_output.pdf'); // an existing pdf
  const parser = new PDFParse();
  await parser.load(buf);
  const text = await parser.getText();
  console.log("TEXT:", text.substring(0, 100));
}
run().catch(console.error);
