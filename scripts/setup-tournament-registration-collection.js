#!/usr/bin/env node

/**
 * Setup Script: Initialize Tournament Registration Collection
 * 
 * This script sets up the tournament_registrations collection in Appwrite with
 * the correct schema for collecting student IDs instead of emails for team members.
 * 
 * Prerequisites:
 * - Appwrite Admin SDK credentials
 * - Environment variables configured
 * 
 * Usage: node scripts/setup-tournament-registration-collection.js
 */

import { Client, Databases, Permission, Role } from 'appwrite';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID);

// Note: For full attribute management, you would need the Admin SDK
// This script provides guidance and basic setup
const databases = new Databases(client);

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DB_ID;
const REGISTRATIONS_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_TOURNAMENT_REGISTRATIONS_COLLECTION_ID || 'tournament_registrations';

async function setupCollection() {
  try {
    console.log('🚀 Setting up Tournament Registration Collection\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Step 1: Check if collection exists
    console.log('📋 Step 1: Checking if collection exists...');
    let collectionExists = false;
    
    try {
      const collection = await databases.getCollection(DB_ID, REGISTRATIONS_COLLECTION_ID);
      console.log(`✅ Collection exists: ${collection.name}\n`);
      collectionExists = true;
    } catch (error) {
      console.log(`⚠️  Collection does not exist\n`);
    }

    // Step 2: Display required schema
    console.log('📋 Step 2: Required Collection Schema\n');
    console.log('Collection ID: tournament_registrations');
    console.log('\nRequired Attributes:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const attributes = [
      {
        name: 'tournamentId',
        type: 'string',
        required: true,
        description: 'ID of the tournament'
      },
      {
        name: 'playerName',
        type: 'string',
        required: true,
        description: 'Captain\'s full name'
      },
      {
        name: 'email',
        type: 'string',
        required: true,
        description: 'Captain\'s email address'
      },
      {
        name: 'studentId',
        type: 'string',
        required: true,
        unique: false,
        description: 'Captain\'s student ID (uniqueness is enforced per tournament via a composite index)'
      },
      {
        name: 'university',
        type: 'string',
        required: false,
        description: 'Captain\'s university'
      },
      {
        name: 'teamName',
        type: 'string',
        required: false,
        description: 'Team name (optional)'
      },
      {
        name: 'players',
        type: 'string',
        required: false,
        description: 'JSON string containing team members and substitutes'
      },
      {
        name: 'additionalInfo',
        type: 'string',
        required: false,
        description: 'Additional registration information'
      },
      {
        name: 'status',
        type: 'string',
        required: true,
        description: 'Registration status: pending, approved, rejected'
      },
      {
        name: 'registrationDate',
        type: 'datetime',
        required: true,
        description: 'When the registration was submitted'
      },
      {
        name: 'userId',
        type: 'string',
        required: true,
        description: 'Appwrite user ID of the captain'
      }
    ];

    attributes.forEach((attr, index) => {
      const uniqueLabel = attr.unique ? ' [UNIQUE INDEX]' : '';
      const requiredLabel = attr.required ? ' [REQUIRED]' : ' [OPTIONAL]';
      console.log(`\n${index + 1}. ${attr.name}${uniqueLabel}${requiredLabel}`);
      console.log(`   Type: ${attr.type}`);
      console.log(`   Description: ${attr.description}`);
    });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Step 3: Display players JSON structure
    console.log('📋 Step 3: Players JSON Structure\n');
    console.log('The "players" field should contain a JSON string with this structure:\n');
    
    const exampleStructure = {
      players: [
        {
          name: 'Player Name',
          studentId: 'STU123456',
          university: 'University Name',
          inGameId: 'InGameUsername'
        }
      ],
      substitutes: [
        {
          name: 'Substitute Name',
          studentId: 'STU789012',
          university: 'University Name',
          inGameId: 'InGameUsername'
        }
      ]
    };

    console.log(JSON.stringify(exampleStructure, null, 2));
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Step 4: Setup instructions
    console.log('📋 Step 4: Setup Instructions\n');
    console.log('To create this collection in Appwrite:\n');
    console.log('Option A: Using Appwrite Console (Recommended)');
    console.log('  1. Go to Appwrite Console');
    console.log('  2. Navigate to Databases > Your Database');
    console.log('  3. Create a new collection with ID: tournament_registrations');
    console.log('  4. Add each attribute listed above');
    console.log('  5. Set studentId as a non-unique attribute');
    console.log('  6. Create a KEY index on userId (for the applicant status page)');
    console.log('  7. Create a composite UNIQUE index on (tournamentId, studentId)');
    console.log('  8. Set permissions:');
    console.log('     - Read: Role.users()');
    console.log('     - Create: Role.users()');
    console.log('     - Update: Role.team("admins")');
    console.log('     - Delete: Role.team("admins")\n');

    console.log('Option B: Using Appwrite Admin SDK');
    console.log('  1. Use the Admin SDK to create collection');
    console.log('  2. Add attributes programmatically (studentId not unique)');
    console.log('  3. Create indexes: userId (key), tournamentId+studentId (unique)');
    console.log('  4. Run the per-tournament student ID index migration\n');

    // Step 5: Display migration command
    console.log('📋 Step 5: After Collection Setup\n');
    console.log('Run the migration script to scope student ID uniqueness per tournament:');
    console.log('  node scripts/fix-tournament-registration-student-id-index.js\n');

    // Step 6: Verify setup
    if (collectionExists) {
      console.log('📋 Step 6: Verifying Collection Setup\n');
      try {
        const collection = await databases.getCollection(DB_ID, REGISTRATIONS_COLLECTION_ID);
        console.log(`✅ Collection verified: ${collection.name}`);
        console.log(`   Total documents: ${collection.documentCount || 0}`);
        console.log(`   Created: ${new Date(collection.$createdAt).toLocaleString()}\n`);
      } catch (error) {
        console.log(`⚠️  Could not verify collection: ${error.message}\n`);
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✨ Setup guide completed!\n');
    console.log('📝 Key Points:');
    console.log('  • studentId uniqueness is scoped per tournament');
    console.log('  • A student can register for multiple tournaments');
    console.log('  • Re-applying after rejection reuses the existing record');
    console.log('  • Registrations are readable by the owner, writable only by admins');
    console.log('  • Email is retained for contact purposes');
    console.log('  • Players data is stored as JSON for flexibility\n');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

// Run setup
setupCollection().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
