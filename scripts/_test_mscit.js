require("dotenv").config()
const mongoose = require("mongoose")

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)
  const col = mongoose.connection.collection("cms_candidates")
  
  // Find candidates that have 'mscit' anywhere in their data (case insensitive regex)
  const regex = /mscit/i
  const candidates = await col.find({
    $or: [
      { keySkills: regex },
      { resumeText: regex },
      { education: regex },
      { "documents.extractedText": regex }
    ]
  }).toArray()
  
  console.log(`Found ${candidates.length} candidates with 'mscit'`)
  for (const c of candidates) {
    console.log(`\n--- Candidate: ${c.fullName} ---`)
    if (c.keySkills && regex.test(c.keySkills.join(" "))) console.log("Matched in keySkills:", c.keySkills)
    if (c.education && regex.test(c.education)) console.log("Matched in education:", c.education)
    if (c.resumeText && regex.test(c.resumeText)) console.log("Matched in resumeText")
    
    // Check documents
    for (const doc of c.documents || []) {
      if (doc.extractedText && regex.test(doc.extractedText)) {
        console.log(`Matched in document '${doc.fileName}'`)
      }
    }
  }
  
  await mongoose.disconnect()
}
main().catch(console.error)
