require("dotenv").config()
const https = require("https")

const url = "https://successhr-files-prod.s3.ap-south-1.amazonaws.com/candidate-documents/1790350666454-14778874-Sahil_Shaikh_Data_Analyst_Resume_Updated.pdf"

https.get(url, (res) => {
  console.log("Status:", res.statusCode)
  console.log("Content-Type:", res.headers["content-type"])
  console.log("Content-Length:", res.headers["content-length"])
  const chunks = []
  res.on("data", c => chunks.push(c))
  res.on("end", () => {
    const buf = Buffer.concat(chunks)
    console.log("Body size:", buf.length)
    console.log("First 100 bytes (ascii):", buf.slice(0,100).toString("ascii").replace(/[^\x20-\x7e]/g,"?"))
  })
}).on("error", e => console.error("Error:", e.message))
