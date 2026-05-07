require('dotenv').config()
const mongoose = require('mongoose')

async function run() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error('MONGODB_URI is required')
  }

  await mongoose.connect(uri)
  const db = mongoose.connection.db

  const collections = await db.listCollections({}, { nameOnly: true }).toArray()
  const collectionNames = new Set(collections.map((item) => item.name))

  if (collectionNames.has('students')) {
    if (collectionNames.has('candidates')) {
      const students = await db.collection('students').find({}).toArray()
      if (students.length) {
        const bulkOps = students.map((doc) => ({
          updateOne: {
            filter: { _id: doc._id },
            update: { $setOnInsert: doc },
            upsert: true
          }
        }))
        await db.collection('candidates').bulkWrite(bulkOps, { ordered: false })
      }
      await db.collection('students').drop()
      console.log('Merged students into candidates and dropped students collection')
    } else {
      await db.collection('students').rename('candidates')
      console.log('Renamed students collection to candidates')
    }
  } else {
    console.log('students collection not found, skipping collection rename')
  }

  if (collectionNames.has('placements')) {
    const indexes = await db.collection('placements').indexes()
    const studentIndex = indexes.find((index) => index.key && index.key.studentId)
    if (studentIndex && studentIndex.name) {
      await db.collection('placements').dropIndex(studentIndex.name)
      console.log(`Dropped legacy placement index: ${studentIndex.name}`)
    }

    await db.collection('placements').updateMany(
      { candidateId: { $exists: false }, studentId: { $exists: true } },
      [
        { $set: { candidateId: '$studentId' } },
        { $unset: 'studentId' }
      ]
    )

    const nextIndexes = await db.collection('placements').indexes()
    const candidateIndex = nextIndexes.find((index) => index.key && index.key.candidateId)
    if (!candidateIndex) {
      await db.collection('placements').createIndex({ candidateId: 1 }, { unique: true })
      console.log('Created placement index: candidateId_1')
    }
    console.log('Updated placements: studentId -> candidateId')
  }

  await mongoose.disconnect()
  console.log('Migration completed successfully')
}

run().catch(async (error) => {
  console.error('Migration failed:', error.message)
  try {
    await mongoose.disconnect()
  } catch (_error) {
    // ignore disconnect errors
  }
  process.exit(1)
})
