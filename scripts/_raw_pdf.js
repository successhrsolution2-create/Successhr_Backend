require("dotenv").config()
const https = require("https")
const mongoose = require("mongoose")

const url = "https://successhr-files-prod.s3.ap-south-1.amazonaws.com/candidate-documents/1790350666454-14778874-Sahil_Shaikh_Data_Analyst_Resume_Updated.pdf"

https.get(url, (res) => {
  const chunks = []
  res.on("data", c => chunks.push(c))
  res.on("end", async () => {
    const buf = Buffer.concat(chunks)
    // Extract text from PDF raw stream - look for BT...ET blocks
    const str = buf.toString("latin1")
    const texts = []
    const btRegex = /BT([\s\S]*?)ET/g
    let m
    while ((m = btRegex.exec(str)) !== null) {
      const block = m[1]
      // Extract strings in parentheses (literal strings)
      const strRegex = /\(([^)]+)\)/g
      let sm
      while ((sm = strRegex.exec(block)) !== null) {
        texts.push(sm[1])
      }
    }
    const extracted = texts.join(" ").replace(/\\n/g, "\n").replace(/\\r/g, "").trim()
    console.log("Raw extracted text:")
    console.log(extracted || "(empty)")
    console.log("\nLength:", extracted.length)
    
    if (extracted.length > 5) {
      await mongoose.connect(process.env.MONGODB_URI)
      const col = mongoose.connection.collection("cms_candidates")
      await col.updateOne(
        { fullName: "sahil" },
        { $set: { resumeText: extracted, "documents.$[elem].extractedText": extracted } },
        { arrayFilters: [{ "elem.documentType": "updatedResume" }] }
      )
      console.log("SAVED!")
      await mongoose.disconnect()
    }
  })
}).on("error", e => console.error("Error:", e.message))
