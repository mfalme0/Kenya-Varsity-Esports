import { Client, Databases, Permission, Query, Role } from 'node-appwrite';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const dbId = process.env.NEXT_PUBLIC_APPWRITE_DB_ID;
const collId = process.env.NEXT_PUBLIC_APPWRITE_PROFILE_COLLECTION_ID;

let offset = 0;
const pageSize = 100;
let fixed = 0;
let total = 0;
while (true) {
  const page = await databases.listDocuments({
    databaseId: dbId,
    collectionId: collId,
    queries: [Query.limit(pageSize), Query.offset(offset)],
  });
  for (const doc of page.documents) {
    total++;
    const perms = doc.$permissions || [];
    const hasRead = perms.some((p) => p.includes(`user:${doc.$id}`) && p.startsWith('read'));
    if (!hasRead) {
      await databases.updateDocument({
        databaseId: dbId,
        collectionId: collId,
        documentId: doc.$id,
        data: {},
        permissions: [
          Permission.read(Role.user(doc.$id)),
          Permission.update(Role.user(doc.$id)),
          Permission.delete(Role.user(doc.$id)),
        ],
      });
      fixed++;
      console.log('fixed', doc.$id);
    }
  }
  if (page.documents.length < pageSize) break;
  offset += pageSize;
}
console.log(`done. total=${total} fixed=${fixed}`);
