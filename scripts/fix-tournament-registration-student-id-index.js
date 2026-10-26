// scripts/fix-tournament-registration-student-id-index.js
/**
 * Migration script: fix the student ID unique index so it is scoped per
 * tournament instead of global.
 *
 * Problem: A global unique index on `studentId` in the `tournament_registrations`
 * collection prevents a student from registering for more than one tournament,
 * and blocks re-application after rejection because the rejected document still
 * holds the student ID.
 *
 * Fix: Drop the legacy global unique index `unique_studentId` and create a
 * composite unique index `unique_tournament_studentId` on
 * `(tournamentId, studentId)`. This allows the same student ID to register for
 * different tournaments while still preventing duplicates within a single
 * tournament.
 *
 * Usage:
 *   cp .env.example .env.local   # (or set the Appwrite env vars)
 *   node scripts/fix-tournament-registration-student-id-index.js
 *
 * Requires: NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT_ID,
 * APPWRITE_API_KEY, NEXT_PUBLIC_APPWRITE_DB_ID, and (optionally)
 * NEXT_PUBLIC_APPWRITE_TOURNAMENT_REGISTRATIONS_COLLECTION_ID.
 */

const { Client, Databases, ID, Query } = require('node-appwrite');

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DB_ID;
const COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_TOURNAMENT_REGISTRATIONS_COLLECTION_ID ||
  'tournament_registrations';

const LEGACY_INDEX = 'unique_studentId';
const NEW_INDEX = 'unique_tournament_studentId';

async function main() {
  if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DB_ID) {
    console.error(
      'Missing Appwrite environment variables. Set NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT_ID, APPWRITE_API_KEY, NEXT_PUBLIC_APPWRITE_DB_ID.'
    );
    process.exit(1);
  }

  const client = new Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID)
    .setKey(API_KEY);
  const databases = new Databases(client);

  console.log(`🔎 Inspecting indexes on collection ${COLLECTION_ID}...`);

  let indexes;
  try {
    indexes = await databases.listIndexes(DB_ID, COLLECTION_ID);
  } catch (err) {
    console.error('Failed to list indexes:', err.message);
    process.exit(1);
  }

  const existing = indexes.indexes.map((i) => i.key || i.name);

  // 1. Drop the legacy global unique index if it exists.
  if (existing.includes(LEGACY_INDEX)) {
    console.log(`🗑️  Dropping legacy index "${LEGACY_INDEX}"...`);
    try {
      await databases.deleteIndex(DB_ID, COLLECTION_ID, LEGACY_INDEX);
      console.log(`   ✅ Dropped "${LEGACY_INDEX}".`);
    } catch (err) {
      console.error(`   ❌ Failed to drop "${LEGACY_INDEX}":`, err.message);
      process.exit(1);
    }
  } else {
    console.log(`   ⏭️  Index "${LEGACY_INDEX}" not found, skipping drop.`);
  }

  // 2. Create the composite unique index if it doesn't exist.
  if (existing.includes(NEW_INDEX)) {
    console.log(`   ⏭️  Index "${NEW_INDEX}" already exists.`);
  } else {
    console.log(`🛠️  Creating composite unique index "${NEW_INDEX}" on (tournamentId, studentId)...`);
    try {
      await databases.createIndex(
        DB_ID,
        COLLECTION_ID,
        NEW_INDEX,
        'unique',
        ['tournamentId', 'studentId']
      );
      console.log(`   ✅ Created "${NEW_INDEX}".`);
    } catch (err) {
      console.error(`   ❌ Failed to create "${NEW_INDEX}":`, err.message);
      console.log(
        '   💡 If this fails because duplicate (tournamentId, studentId) rows already exist, '
        + 'dedupe them first (keep one active registration per student per tournament).'
      );
      process.exit(1);
    }
  }

  // Verify
  const updated = await databases.listIndexes(DB_ID, COLLECTION_ID);
  console.log('\n📋 Current indexes on tournament_registrations:');
  for (const idx of updated.indexes) {
    console.log(`   - ${idx.key || idx.name} (${idx.type}) attributes: ${(idx.attributes || []).join(', ')}`);
  }

  console.log('\n✅ Migration complete. Student ID uniqueness is now scoped per tournament.');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
