require("dotenv").config()
const mongoose = require("mongoose")
const pdfParseModule = require("pdf-parse")
const https = require("https")
const http = require("http")

// Use same pattern as cmsController.js
const pdfParse = typeof pdfParseModule === "function" ? pdfParseModule : (pdfParseModule.default || pdfParseModule.PDFParse)

console.log("pdfParse type:", typeof pdfParse)

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http
    const req = mod.get(url, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return downloadBuffer(res.headers.location).then(resolve).catch(reject)
      }
      const chunks = []
      res.on("data", chunk => chunks.push(chunk))
      res.on("end", () => resolve(Buffer.concat(chunks)))
      res.on("error", reject)
    })
    req.on("error", reject)
  })
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)
  const col = mongoose.connection.collection("cms_candidates")
  const all = await col.find({ "documents.0": { $exists: true } }).toArray()
  
  let fixed = 0
  for (const c of all) {
    for (const doc of (c.documents || [])) {
      if (doc.documentType !== "updatedResume") continue
      if (doc.extractedText) { console.log(`${c.fullName}: already has text`); continue }
      if (!doc.fileUrl) { console.log(`${c.fullName}: no fileUrl`); continue }
      
      console.log(`\nProcessing ${c.fullName}: ${doc.fileName}`)
      try {
        const buf = await downloadBuffer(doc.fileUrl)
        console.log(`  Downloaded: ${buf.length} bytes`)
        
        // Use the same approach as cmsController
        let text = ""
        try {
          const result = await new Promise((res, rej) => {
            const { exec } = require("child_process")
            // Try using the buffer directly via Node APIs
            res(null)
          })
        } catch(e) {}
        
        // Direct buffer test
        console.log("  Buffer header:", buf.slice(0,5).toString("ascii"))
        if (buf.slice(0,4).toString("ascii") === "%PDF") {
          console.log("  Valid PDF confirmed")
        }
        
        await mongoose.disconnect()
        process.exit(0)
      } catch (err) {
        console.error(`  ERROR: ${err.message}`)
      }
    }
  }
  await mongoose.disconnect()
}
main().catch(e => { console.error(e.message); process.exit(1) })
