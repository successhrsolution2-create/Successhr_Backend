require("dotenv").config()
const mongoose = require("mongoose")
async function main() {
  await mongoose.connect(process.env.MONGODB_URI)
  const col = mongoose.connection.collection("cms_candidates")
  const all = await col.find({}).project({
    fullName:1, keySkills:1, currentDesignation:1, appliedFor:1,
    resumeText:1, education:1, careerSummary:1,
    "documents.documentType":1, "documents.extractedText":1, "documents.fileName":1
  }).toArray()
  for (const c of all) {
    const hasResume = c.documents?.some(d => d.extractedText)
    console.log(`\n== ${c.fullName} ==`)
    console.log("  keySkills:", c.keySkills)
    console.log("  designation:", c.currentDesignation)
    console.log("  appliedFor:", c.appliedFor)
    console.log("  resumeText:", c.resumeText ? c.resumeText.substring(0, 80) + "..." : "EMPTY")
    console.log("  docs with extractedText:", hasResume ? "YES" : "NO")
    if (hasResume) {
      const doc = c.documents.find(d => d.extractedText)
      console.log("  doc extractedText preview:", doc.extractedText.substring(0, 120))
    }
  }
  await mongoose.disconnect()
}
main().catch(e => { console.error(e.message); process.exit(1) })
