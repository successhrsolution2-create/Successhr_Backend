const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: './.env' });

const CrmCandidate = require('./crm/models/CrmCandidate.model');
const CrmCallLog = require('./crm/models/CrmCallLog.model');

async function runMigration() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const result = await CrmCandidate.updateMany(
      { callStatus: 'converted' },
      { $set: { callStatus: 'sure' } }
    );
    console.log(`Updated ${result.modifiedCount} CrmCandidate records`);

    const resultLogs = await CrmCallLog.updateMany(
      { callStatus: 'converted' },
      { $set: { callStatus: 'sure' } }
    );
    console.log(`Updated ${resultLogs.modifiedCount} CrmCallLog records`);

    console.log('Migration complete');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

runMigration();
