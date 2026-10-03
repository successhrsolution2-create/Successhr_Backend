require("dotenv").config()
const mongoose = require("mongoose")
async function main() {
  await mongoose.connect(process.env.MONGODB_URI)
  const col = mongoose.connection.collection("cms_candidates")
  const all = await col.find({}).toArray()
  for (const c of all) {
    console.log(`\n== ${c.fullName} ==`)
    console.log("  resumeText top-level:", c.resumeText ? `YES (${c.resumeText.length} chars)` : "MISSING")
    console.log("  documents count:", (c.documents || []).length)
    for (const doc of (c.documents || [])) {
      console.log(`  doc type=${doc.documentType} file=${doc.fileName}`)
      console.log(`      extractedText: ${doc.extractedText ? "YES ("+doc.extractedText.length+" chars): "+doc.extractedText.substring(0,100) : "EMPTY/NULL"}`)
    }
  }
  await mongoose.disconnect()
}
main().catch(e => { console.error(e.message); process.exit(1) })
