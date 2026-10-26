import { Client, Databases } from 'node-appwrite';

/**
 * Server-only lookup of a tournament document for registration enforcement.
 */

let client: Client | null = null;
let databases: Databases | null = null;

const initializeAppwrite = () => {
  if (!client) {
    const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
    const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
    const apiKey = process.env.APPWRITE_API_KEY;
    if (!endpoint || !projectId || !apiKey) return null;
    try {
      client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
      databases = new Databases(client);
    } catch {
      return null;
    }
  }
  return databases;
};

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DB_ID || '';
const TOURNAMENTS_COLLECTION =
  process.env.NEXT_PUBLIC_APPWRITE_TOURNAMENTS_COLLECTION_ID || 'tournaments';

export interface TournamentLookup {
  /** False when Appwrite is not configured in this environment. */
  configured: boolean;
  tournament: Record<string, unknown> | null;
}

export async function getTournamentForRegistration(
  tournamentId: string
): Promise<TournamentLookup> {
  const db = initializeAppwrite();
  if (!db || !DB_ID) {
    return { configured: false, tournament: null };
  }

  try {
    const document = await db.getDocument(DB_ID, TOURNAMENTS_COLLECTION, tournamentId);
    return { configured: true, tournament: document as unknown as Record<string, unknown> };
  } catch (error: unknown) {
    const code = (error as { code?: number })?.code;
    if (code === 404) {
      return { configured: true, tournament: null };
    }
    console.error('[Registration] Failed to load tournament:', error);
    return { configured: false, tournament: null };
  }
}
