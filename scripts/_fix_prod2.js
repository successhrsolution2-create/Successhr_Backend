require("dotenv").config()
const mongoose = require("mongoose")
const pdfParse = require("pdf-parse")
const https = require("https")

const uri = "mongodb://successhrsolution2_db_user:Muox6v1dZyNeFNkG@ac-xje36sb-shard-00-00.slwhvbo.mongodb.net:27017,ac-xje36sb-shard-00-01.slwhvbo.mongodb.net:27017,ac-xje36sb-shard-00-02.slwhvbo.mongodb.net:27017/successhr?tls=true&replicaSet=atlas-letexg-shard-0&authSource=admin"

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
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
  await mongoose.connect(uri)
  console.log("Connected to PROD DB")
  const col = mongoose.connection.collection("cms_candidates")
  const all = await col.find({ "documents.0": { $exists: true } }).toArray()
  
  let fixed = 0
  for (const c of all) {
    for (const doc of (c.documents || [])) {
      if (!doc.fileUrl) continue
      
      if (doc.extractedText && doc.extractedText.length > 50) continue
      
      console.log(`\nProcessing PROD: ${c.fullName} -> ${doc.fileName}`)
      try {
        const buf = await downloadBuffer(doc.fileUrl)
        const parsed = await pdfParse(buf)
        const text = (parsed.text || "").trim()
        console.log(`  Chars extracted: ${text.length}`)
        if (text.length > 5) {
          await col.updateOne(
            { _id: c._id, "documents._id": doc._id },
            { $set: { "documents.$.extractedText": text, resumeText: text } }
          )
          console.log(`  SAVED to PROD DB successfully!`)
          fixed++
        } else {
          console.log("  WARNING: PDF text is empty - may be image-based PDF")
        }
      } catch (err) {
        console.error(`  ERROR: ${err.message}`)
      }
    }
  }
  console.log(`\n=== Fixed ${fixed} PROD candidates ===`)
  await mongoose.disconnect()
}
main().catch(e => { console.error(e.message); process.exit(1) })
