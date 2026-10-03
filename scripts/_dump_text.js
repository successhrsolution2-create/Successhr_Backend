require("dotenv").config()
const mongoose = require("mongoose")

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)
  const col = mongoose.connection.collection("cms_candidates")
  const all = await col.find({}).toArray()
  for (const c of all) {
    if (c.resumeText) {
      console.log(`\n\n--- TEXT FOR ${c.fullName} ---`)
      console.log(c.resumeText.substring(0, 500) + "...")
    }
  }
  await mongoose.disconnect()
}
main().catch(console.error)
