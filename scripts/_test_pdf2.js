const { PDFParse } = require("pdf-parse")
const https = require("https")

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = []
      res.on("data", chunk => chunks.push(chunk))
      res.on("end", () => resolve(Buffer.concat(chunks)))
      res.on("error", reject)
    }).on("error", reject)
  })
}

async function main() {
  const buf = await downloadBuffer("https://successhr-cms.s3.ap-south-1.amazonaws.com/1790425875691-Sahil_Shaikh_Data_Analyst_Resume_Updated.pdf")
  const parser = new PDFParse()
  await parser.load(buf)
  const text = await parser.getText()
  console.log("TEXT EXTRACTED:", text.substring(0, 200))
}
main().catch(console.error)
