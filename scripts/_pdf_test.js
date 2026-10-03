require("dotenv").config()
const pdfLib = require("pdf-parse")
const https = require("https")

const url = "https://successhr-files-prod.s3.ap-south-1.amazonaws.com/candidate-documents/1790350666454-14778874-Sahil_Shaikh_Data_Analyst_Resume_Updated.pdf"

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
  const buf = await downloadBuffer(url)
  console.log("Downloaded:", buf.length, "bytes")
  
  // Try PDFParse class
  const parser = new pdfLib.PDFParse()
  try {
    const result = await parser.parseBuffer(buf)
    console.log("Text length:", result.text?.length)
    console.log("Preview:", result.text?.substring(0, 300))
  } catch(e) {
    console.log("parseBuffer error:", e.message)
    
    // Try parse method
    try {
      const result2 = await parser.parse(buf)
      console.log("parse() result:", result2?.text?.substring(0,100))
    } catch(e2) {
      console.log("parse() error:", e2.message)
      // Show available methods
      console.log("Methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(parser)).join(", "))
    }
  }
}
main().catch(e => console.error("FATAL:", e.message))
