require('dotenv').config()
const { MongoClient } = require('mongodb')

const DEFAULT_LOCAL_URI = 'mongodb://127.0.0.1:27017/job-consultancy'

const parseDbName = (uri, fallback) => {
  try {
    const parsed = new URL(uri)
    return (parsed.pathname || '').replace(/^\//, '') || fallback
  } catch (_error) {
    return fallback
  }
}

const copyCollection = async ({ sourceDb, targetDb, collectionName, dropTarget }) => {
  const sourceCollection = sourceDb.collection(collectionName)
  const targetCollection = targetDb.collection(collectionName)

  const sourceCount = await sourceCollection.countDocuments()

  if (dropTarget) {
    try {
      await targetCollection.drop()
    } catch (error) {
      if (error.codeName !== 'NamespaceNotFound') throw error
    }
  } else {
    await targetCollection.deleteMany({})
  }

  const cursor = sourceCollection.find({})
  const batch = []
  let inserted = 0
  const BATCH_SIZE = 1000

  while (await cursor.hasNext()) {
    batch.push(await cursor.next())
    if (batch.length >= BATCH_SIZE) {
      await targetCollection.insertMany(batch, { ordered: false })
      inserted += batch.length
      batch.length = 0
    }
  }

  if (batch.length) {
    await targetCollection.insertMany(batch, { ordered: false })
    inserted += batch.length
  }

  const sourceIndexes = await sourceCollection.indexes()
  const customIndexes = sourceIndexes
    .filter((index) => index.name !== '_id_')
    .map((index) => {
      const spec = {
        key: index.key,
        name: index.name
      }

      if (index.unique) spec.unique = true
      if (index.sparse) spec.sparse = true
      if (index.expireAfterSeconds !== undefined) spec.expireAfterSeconds = index.expireAfterSeconds
      if (index.partialFilterExpression) spec.partialFilterExpression = index.partialFilterExpression
      if (index.collation) spec.collation = index.collation

      return spec
    })

  if (customIndexes.length) {
    await targetCollection.createIndexes(customIndexes)
  }

  const targetCount = await targetCollection.countDocuments()
  return { collectionName, sourceCount, inserted, targetCount, copiedIndexes: customIndexes.length }
}

async function migrate() {
  const localUri = process.env.LOCAL_MONGODB_URI || DEFAULT_LOCAL_URI
  const atlasUri = process.env.MONGODB_URI

  if (!atlasUri) {
    throw new Error('MONGODB_URI is missing in backend/.env')
  }

  const sourceDbName = process.env.LOCAL_DB_NAME || parseDbName(localUri, 'job-consultancy')
  const targetDbName = process.env.ATLAS_DB_NAME || parseDbName(atlasUri, 'test')
  const dropTarget = process.env.MIGRATION_DROP_TARGET !== 'false'

  console.log(`Source: ${sourceDbName} (${localUri})`)
  console.log(`Target: ${targetDbName} (Atlas URI from MONGODB_URI)`)
  console.log(`Mode: ${dropTarget ? 'drop+replace collections' : 'clear+replace documents'}`)

  const sourceClient = new MongoClient(localUri)
  const targetClient = new MongoClient(atlasUri)

  await sourceClient.connect()
  await targetClient.connect()

  try {
    const sourceDb = sourceClient.db(sourceDbName)
    const targetDb = targetClient.db(targetDbName)

    const collections = await sourceDb.listCollections({}, { nameOnly: true }).toArray()
    const names = collections.map((collection) => collection.name).filter((name) => !name.startsWith('system.'))

    if (!names.length) {
      console.log('No collections found in source database.')
      return
    }

    const summary = []
    for (const name of names) {
      const result = await copyCollection({ sourceDb, targetDb, collectionName: name, dropTarget })
      summary.push(result)
      console.log(
        `Migrated ${name}: source=${result.sourceCount}, inserted=${result.inserted}, target=${result.targetCount}, indexes=${result.copiedIndexes}`
      )
    }

    const totalSource = summary.reduce((sum, row) => sum + row.sourceCount, 0)
    const totalTarget = summary.reduce((sum, row) => sum + row.targetCount, 0)
    console.log(`Done. Collections=${summary.length}, Total source docs=${totalSource}, Total target docs=${totalTarget}`)
  } finally {
    await sourceClient.close()
    await targetClient.close()
  }
}

migrate().catch((error) => {
  console.error('Migration failed:', error.message)
  process.exit(1)
})
