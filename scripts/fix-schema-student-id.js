
import { Client, Databases, Permission, Role } from 'node-appwrite';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client();
const databases = new Databases(client);

// Configuration
const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DB_ID;
const COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_TOURNAMENT_REGISTRATIONS_COLLECTION_ID || 'tournament_registrations';

if (!API_KEY) {
    console.error('❌ Error: APPWRITE_API_KEY is missing in .env file.');
    console.error('Please add your Appwrite API Key with "attributes.write" and "indexes.write" scopes.');
    process.exit(1);
}

client
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID)
    .setKey(API_KEY);

async function fixSchema() {
    try {
        console.log(`🚀 Starting schema fix for collection: ${COLLECTION_ID}`);
        
        // 1. Add studentId attribute
        try {
            console.log('📝 Adding "studentId" attribute...');
            await databases.createStringAttribute(
                DB_ID,
                COLLECTION_ID,
                'studentId',
                50,     // size
                false   // required (false to allow existing docs to be updated later/avoid locking)
            );
            console.log('✅ Attribute creation initiated.');
        } catch (error) {
            if (error.code === 409) {
                console.log('ℹ️ Attribute "studentId" already exists.');
            } else {
                throw error;
            }
        }

        // 2. Wait for attribute to be available
        console.log('⏳ Waiting for attribute to be available (this may take a moment)...');
        await new Promise(resolve => setTimeout(resolve, 3000)); // Simple wait, robust way is polling

        // 3. (Legacy) Create a non-unique lookup index for "studentId".
        //    NOTE: We intentionally do NOT create a global unique index on
        //    studentId, because that blocks a student from entering multiple
        //    tournaments. Uniqueness is now enforced per tournament via the
        //    composite index created by
        //    scripts/fix-tournament-registration-student-id-index.js
        //    (`unique_tournament_studentId` on tournamentId + studentId).
        try {
            console.log('🔍 Creating non-unique lookup index for "studentId"...');
            await databases.createIndex(
                DB_ID,
                COLLECTION_ID,
                'studentId_lookup', // key
                'key',             // type (non-unique)
                ['studentId']      // attributes
            );
            console.log('✅ Index creation initiated.');
        } catch (error) {
             if (error.code === 409) {
                console.log('ℹ️ Index "studentId_lookup" already exists.');
            } else {
                console.warn(`⚠️ Failed to create index: ${error.message}`);
            }
        }

        console.log('🎉 Schema fix completed successfully!');

    } catch (error) {
        console.error('❌ Error fixing schema:', error);
        process.exit(1);
    }
}

fixSchema();
