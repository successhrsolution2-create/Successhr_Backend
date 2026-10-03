require("dotenv").config()
const mongoose = require("mongoose")
async function main() {
  await mongoose.connect(process.env.MONGODB_URI)
  
  // Check main candidates collection too
  const cms = mongoose.connection.collection("cms_candidates")
  const main = mongoose.connection.collection("candidates")
  
  const cmsCount = await cms.countDocuments()
  const mainCount = await main.countDocuments()
  
  const mainWithData = await main.find({}).project({
    fullName:1, keySkills:1, currentDesignation:1, appliedFor:1, resumeText:1
  }).limit(5).toArray()
  
  console.log("=== cms_candidates:", cmsCount)
  console.log("=== candidates:", mainCount)
  console.log("Sample main candidates:")
  mainWithData.forEach(c => {
    console.log(`  ${c.fullName}: skills=${JSON.stringify(c.keySkills)}, resumeText=${c.resumeText ? "YES("+c.resumeText.length+"chars)" : "NO"}`)
  })
  
  // Check all collections
  const colls = await mongoose.connection.db.listCollections().toArray()
  console.log("\nAll collections:", colls.map(c=>c.name).join(", "))
  
  await mongoose.disconnect()
}
main().catch(e => { console.error(e.message); process.exit(1) })
