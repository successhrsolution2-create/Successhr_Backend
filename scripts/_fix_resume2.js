require("dotenv").config()
const mongoose = require("mongoose")
const pdf = require("pdf-parse")
const https = require("https")
const http = require("http")

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http
    mod.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadBuffer(res.headers.location).then(resolve).catch(reject)
      }
      const chunks = []
      res.on("data", chunk => chunks.push(chunk))
      res.on("end", () => resolve(Buffer.concat(chunks)))
      res.on("error", reject)
    }).on("error", reject)
  })
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
        const parsed = await pdf(buf)
        const text = (parsed.text || "").trim()
        console.log(`  Extracted: ${text.length} chars`)
        if (text.length > 10) {
          console.log(`  Preview: ${text.substring(0, 200)}`)
          await col.updateOne(
            { _id: c._id, "documents._id": doc._id },
            { $set: { "documents.$.extractedText": text, resumeText: text } }
          )
          console.log(`  SAVED!`)
          fixed++
        } else {
          console.log(`  No meaningful text extracted (may be image PDF)`)
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
