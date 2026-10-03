require("dotenv").config()
const mongoose = require("mongoose")
const pdfLib = require("pdf-parse")
const PDFParse = pdfLib.PDFParse
const https = require("https")
const http = require("http")

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http
    const req = mod.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
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

async function parsePdf(buf) {
  const parser = new PDFParse()
  const data = await parser.parseBuffer(buf)
  return data.text || ""
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)
  const col = mongoose.connection.collection("cms_candidates")
  const all = await col.find({ "documents.documentType": "updatedResume" }).toArray()
  
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
        const text = (await parsePdf(buf)).trim()
        console.log(`  Extracted: ${text.length} chars`)
        if (text.length > 10) {
          console.log(`  Preview: ${text.substring(0, 300)}`)
          await col.updateOne(
            { _id: c._id, "documents._id": doc._id },
            { $set: { "documents.$.extractedText": text, resumeText: text } }
          )
          console.log(`  SAVED!`)
          fixed++
        } else {
          console.log(`  No text extracted`)
        }
      } catch (err) {
        console.error(`  ERROR: ${err.message}`)
      }
    }
  }
  console.log(`\nFixed ${fixed} candidates`)
  await mongoose.disconnect()
}
main().catch(e => { console.error(e.message); process.exit(1) })
