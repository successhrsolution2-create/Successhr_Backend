require("dotenv").config()
const mongoose = require("mongoose")

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)
  const col = mongoose.connection.collection("cms_candidates")
  const all = await col.find({}).toArray()
  
  for (const c of all) {
    console.log(`\nCandidate: ${c.fullName}`)
    console.log(`  Key Skills: ${c.keySkills ? c.keySkills.join(', ') : 'none'}`)
    console.log(`  ResumeText length: ${c.resumeText ? c.resumeText.length : 0}`)
    for (const doc of c.documents || []) {
      console.log(`  Doc: ${doc.fileName}`)
      console.log(`    extractedText length: ${doc.extractedText ? doc.extractedText.length : 0}`)
    }
  }
  
  await mongoose.disconnect()
}
main().catch(console.error)
