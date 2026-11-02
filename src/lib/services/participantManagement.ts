// src/lib/services/participantManagement.ts
/**
 * Participant Management Service
 * Handles participant CRUD, registration, and status management
 */

import { cache, CACHE_KEYS, CACHE_TTL } from '@/lib/cache';
import { notificationService, NotificationType } from './notification';
import type { TournamentParticipant, TournamentRegistration } from '@/types/tournament';
import { Client, Databases, ID, Query } from 'node-appwrite';

export interface ParticipantFilters {
  status?: TournamentParticipant['status'];
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface ParticipantListResult {
  participants: TournamentParticipant[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Extended TournamentRegistration interface to include team data
export interface ExtendedTournamentRegistration extends TournamentRegistration {
  studentId: string;
  players?: string; // JSON string containing team members
  userId?: string;
}

class ParticipantManagementService {
  private client: Client;
  private databases: Databases;
  private dbId: string;
  private collectionId: string;

  constructor() {
    // Initialize Appwrite client
    this.client = new Client()
      .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || '')
      .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '')
      .setKey(process.env.APPWRITE_API_KEY || '');

    this.databases = new Databases(this.client);
    this.dbId = process.env.NEXT_PUBLIC_APPWRITE_DB_ID || '';
    this.collectionId = process.env.NEXT_PUBLIC_APPWRITE_TOURNAMENT_REGISTRATIONS_COLLECTION_ID || 'tournament_registrations';
  }

  /**
   * Register a new participant
   */
  async register(
    tournamentId: string,
    registration: TournamentRegistration & { studentId?: string; players?: string; userId?: string }
  ): Promise<{
    success: boolean;
    participant?: TournamentParticipant;
    error?: string;
  }> {
    try {
      // Validate studentId is provided
      if (!registration.studentId || registration.studentId.trim() === '') {
        return { success: false, error: 'Student ID is required' };
      }

      const email = (registration.email || '').toLowerCase();
      const studentId = registration.studentId.trim();

      // Fetch registrations for this tournament (by email) and all registrations
      // for this student ID (to enforce per-tournament uniqueness). The global
      // unique index on studentId is only dropped by a migration; we still
      // enforce scoping in application code.
      const [emailResult, studentResult] = await Promise.all([
        this.databases.listDocuments(this.dbId, this.collectionId, [
          Query.equal('tournamentId', tournamentId),
          Query.equal('email', email),
        ]),
        this.databases.listDocuments(this.dbId, this.collectionId, [
          Query.equal('studentId', studentId),
        ]),
      ]);

      const isActive = (doc: any) =>
        doc.status !== 'rejected' && doc.status !== 'withdrawn';

      // An active registration with the same email blocks re-registration
      const activeEmailDoc = emailResult.documents.find(isActive);
      if (activeEmailDoc) {
        return { success: false, error: 'Email already registered for this tournament' };
      }

      // An active registration with the same student ID in this tournament blocks
      // re-registration; a student ID used in another tournament is only allowed
      // after the global unique index is migrated.
      const activeStudentInTournament = studentResult.documents.find(
        (doc: any) => isActive(doc) && doc.tournamentId === tournamentId
      );
      if (activeStudentInTournament) {
        return { success: false, error: 'Student ID already registered for this tournament' };
      }

      // Re-use an existing rejected/withdrawn registration for this tournament
      // (matched by email or student ID) to avoid creating a new document and
      // to dodge the legacy global unique index.
      const reusableDoc =
        emailResult.documents.find((doc: any) => !isActive(doc)) ||
        studentResult.documents.find(
          (doc: any) => !isActive(doc) && doc.tournamentId === tournamentId
        );

      // Create/update participant record
      const participantData = {
        tournamentId,
        playerName: registration.playerName,
        email,
        studentId,
        university: registration.university,
        teamName: registration.teamName,
        players: registration.players || JSON.stringify({ players: [], substitutes: [] }),
        additionalInfo: registration.additionalInfo,
        status: 'registered',
        registrationDate: new Date().toISOString(),
        userId: registration.userId || `user_${email}`,
      };

      let document: any;

      if (reusableDoc) {
        document = await this.databases.updateDocument(
          this.dbId,
          this.collectionId,
          reusableDoc.$id,
          participantData
        );
      } else {
        try {
          document = await this.databases.createDocument(
            this.dbId,
            this.collectionId,
            ID.unique(),
            participantData
          );
        } catch (error: any) {
          if (error?.code === 409) {
            return { success: false, error: 'Student ID already exists' };
          }
          throw error;
        }
      }

      const participant: TournamentParticipant = {
        id: document.$id,
        tournamentId: document.tournamentId,
        userId: document.userId,
        playerName: document.playerName,
        email: document.email,
        university: document.university,
        teamName: document.teamName,
        registrationDate: document.registrationDate,
        status: document.status,
      };

      // Invalidate cache
      await cache.delete(CACHE_KEYS.participantList(tournamentId));

      // Send confirmation notification
      await notificationService.sendToUser(participant.userId, {
        type: NotificationType.REGISTRATION_CONFIRMED,
        title: 'Registration Confirmed!',
        message: `You have successfully registered for the tournament.`,
        data: { tournamentId, participantId: participant.id },
      });

      return { success: true, participant };
    } catch (error: any) {
      console.error('[ParticipantManagement] Register error:', error);
      
      // Handle Appwrite specific errors
      if (error?.code === 409) {
        return { success: false, error: 'Student ID already exists' };
      }
      
      return { success: false, error: 'Registration failed' };
    }
  }

  /**
   * Check for student ID conflicts (active registrations only)
   */
  async checkStudentConflicts(studentId: string, tournamentId?: string): Promise<boolean> {
    try {
      // Skip validation if studentId is empty or null
      if (!studentId || studentId.trim() === '') {
        return false;
      }

      const result = await this.databases.listDocuments(
        this.dbId,
        this.collectionId,
        [Query.equal('studentId', studentId.trim())]
      );

      return result.documents.some(
        (doc: any) =>
          doc.status !== 'rejected' &&
          doc.status !== 'withdrawn' &&
          (!tournamentId || doc.tournamentId === tournamentId)
      );
    } catch (error) {
      console.error('[ParticipantManagement] checkStudentConflicts error:', error);
      return false;
    }
  }

  /**
   * Create a registration (alias for register)
   */
  async createRegistration(
    tournamentId: string,
    registration: TournamentRegistration & { studentId?: string; players?: string; userId?: string }
  ): Promise<{
    success: boolean;
    participant?: TournamentParticipant;
    error?: string;
  }> {
    return this.register(tournamentId, registration);
  }

  /**
   * Get participant by ID
   */
  async getById(id: string): Promise<TournamentParticipant | null> {
    try {
      const document = await this.databases.getDocument(
        this.dbId,
        this.collectionId,
        id
      );

      return {
        id: document.$id,
        tournamentId: document.tournamentId,
        userId: document.userId,
        playerName: document.playerName,
        email: document.email,
        university: document.university,
        teamName: document.teamName,
        registrationDate: document.registrationDate,
        status: document.status,
      };
    } catch (error: any) {
      if (error?.code === 404) {
        return null;
      }
      console.error('[ParticipantManagement] getById error:', error);
      return null;
    }
  }

  /**
   * Get all registrations
   */
  async getAllRegistrations(): Promise<TournamentParticipant[]> {
    try {
      const result = await this.databases.listDocuments(
        this.dbId,
        this.collectionId
      );

      return result.documents.map((doc: any) => ({
        id: doc.$id,
        tournamentId: doc.tournamentId,
        userId: doc.userId,
        playerName: doc.playerName,
        email: doc.email,
        university: doc.university,
        teamName: doc.teamName,
        registrationDate: doc.registrationDate,
        status: doc.status,
      }));
    } catch (error) {
      console.error('[ParticipantManagement] getAllRegistrations error:', error);
      return [];
    }
  }

  /**
   * Get registration by ID (alias for getById)
   */
  async getRegistrationById(id: string): Promise<TournamentParticipant | null> {
    return this.getById(id);
  }

/**
   * Get participant by email and tournament (returns an active registration only)
   */
  async getByEmailAndTournament(
    tournamentId: string,
    email: string
  ): Promise<TournamentParticipant | null> {
    try {
      const result = await this.databases.listDocuments(
        this.dbId,
        this.collectionId,
        [
          Query.equal('tournamentId', tournamentId),
          Query.equal('email', email.toLowerCase())
        ]
      );

      const activeDoc = result.documents.find(
        (doc: any) => doc.status !== 'rejected' && doc.status !== 'withdrawn'
      );

      if (!activeDoc) {
        return null;
      }

      const doc = activeDoc as any;
      return {
        id: doc.$id,
        tournamentId: doc.tournamentId,
        userId: doc.userId,
        playerName: doc.playerName,
        email: doc.email,
        university: doc.university,
        teamName: doc.teamName,
        registrationDate: doc.registrationDate,
        status: doc.status,
      };
    } catch (error) {
      console.error('[ParticipantManagement] getByEmailAndTournament error:', error);
      return null;
    }
  }

/**
   * List participants for a tournament
   */
  async listByTournament(
    tournamentId: string,
    filters: ParticipantFilters = {}
  ): Promise<ParticipantListResult> {
    const { page = 1, pageSize = 50 } = filters;

    try {
      // Build queries
      const queries = [Query.equal('tournamentId', tournamentId)];
      
      if (filters.status) {
        queries.push(Query.equal('status', filters.status));
      }

      // Get all documents for this tournament
      const result = await this.databases.listDocuments(
        this.dbId,
        this.collectionId,
        queries
      );

      // Map documents to participants
      let participants = result.documents.map((doc: any) => ({
        id: doc.$id,
        tournamentId: doc.tournamentId,
        userId: doc.userId,
        playerName: doc.playerName,
        email: doc.email,
        university: doc.university,
        teamName: doc.teamName,
        registrationDate: doc.registrationDate,
        status: doc.status,
      }));

      // Apply search filter if provided
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        participants = participants.filter(
          (p) =>
            p.playerName.toLowerCase().includes(searchLower) ||
            p.email.toLowerCase().includes(searchLower) ||
            p.teamName?.toLowerCase().includes(searchLower)
        );
      }

      // Sort by registration date
      participants.sort(
        (a, b) =>
          new Date(b.registrationDate).getTime() -
          new Date(a.registrationDate).getTime()
      );

      const total = participants.length;
      const totalPages = Math.ceil(total / pageSize);
      const start = (page - 1) * pageSize;
      const paged = participants.slice(start, start + pageSize);

      return {
        participants: paged,
        total,
        page,
        pageSize,
        totalPages,
      };
    } catch (error) {
      console.error('[ParticipantManagement] listByTournament error:', error);
      return {
        participants: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
      };
    }
  }

/**
   * Update participant status
   */
  async updateStatus(
    id: string,
    status: TournamentParticipant['status']
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const participant = await this.getById(id);
      if (!participant) {
        return { success: false, error: 'Participant not found' };
      }

      // Validate status transition
      const validTransitions: Record<string, string[]> = {
        registered: ['confirmed', 'withdrawn'],
        confirmed: ['disqualified', 'withdrawn'],
        disqualified: [],
        withdrawn: [],
      };

      const allowed = validTransitions[participant.status] || [];
      if (!allowed.includes(status)) {
        return { success: false, error: `Cannot transition from ${participant.status} to ${status}` };
      }

      // Update status in Appwrite
      await this.databases.updateDocument(
        this.dbId,
        this.collectionId,
        id,
        { status }
      );

      // Invalidate cache
      await cache.delete(CACHE_KEYS.participantList(participant.tournamentId));

      return { success: true };
    } catch (error: any) {
      console.error('[ParticipantManagement] Update status error:', error);
      
      if (error?.code === 404) {
        return { success: false, error: 'Participant not found' };
      }
      
      return { success: false, error: 'Status update failed' };
    }
  }

  /**
   * Confirm participant
   */
  async confirm(id: string): Promise<{ success: boolean; error?: string }> {
    return this.updateStatus(id, 'confirmed');
  }

  /**
   * Disqualify participant
   */
  async disqualify(
    id: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    const result = await this.updateStatus(id, 'disqualified');
    
    if (result.success) {
      const participant = await this.getById(id);
      if (participant) {
        await notificationService.sendToUser(participant.userId, {
          type: NotificationType.SYSTEM_ALERT,
          title: 'Disqualification Notice',
          message: reason || 'You have been disqualified from the tournament.',
          data: { tournamentId: participant.tournamentId, reason },
        });
      }
    }

    return result;
  }

  /**
   * Withdraw participant
   */
  async withdraw(id: string): Promise<{ success: boolean; error?: string }> {
    return this.updateStatus(id, 'withdrawn');
  }

/**
   * Get participant count for tournament (active registrations only)
   */
  async getCount(tournamentId: string): Promise<number> {
    try {
      const result = await this.databases.listDocuments(
        this.dbId,
        this.collectionId,
        [
          Query.equal('tournamentId', tournamentId),
          Query.notEqual('status', 'withdrawn')
        ]
      );
      // Exclude rejected registrations from capacity counts.
      return result.documents.filter((doc: any) => doc.status !== 'rejected').length;
    } catch (error) {
      console.error('[ParticipantManagement] getCount error:', error);
      return 0;
    }
  }

  /**
   * Get active participant count for tournament (registered/confirmed)
   */
  async getActiveCount(tournamentId: string): Promise<number> {
    try {
      const result = await this.databases.listDocuments(
        this.dbId,
        this.collectionId,
        [
          Query.equal('tournamentId', tournamentId),
        ]
      );
      return result.documents.filter(
        (doc: any) => doc.status !== 'rejected' && doc.status !== 'withdrawn'
      ).length;
    } catch (error) {
      console.error('[ParticipantManagement] getActiveCount error:', error);
      return 0;
    }
  }

  /**
   * Check if user already registered
   */
  async isRegistered(tournamentId: string, email: string): Promise<boolean> {
    const participant = await this.getByEmailAndTournament(tournamentId, email);
    return participant !== null;
  }

/**
   * Delete participant (admin only)
   */
  async delete(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const participant = await this.getById(id);
      if (!participant) {
        return { success: false, error: 'Participant not found' };
      }

      // Delete from Appwrite
      await this.databases.deleteDocument(
        this.dbId,
        this.collectionId,
        id
      );

      // Invalidate cache
      await cache.delete(CACHE_KEYS.participantList(participant.tournamentId));

      return { success: true };
    } catch (error: any) {
      console.error('[ParticipantManagement] Delete error:', error);
      
      if (error?.code === 404) {
        return { success: false, error: 'Participant not found' };
      }
      
      return { success: false, error: 'Delete failed' };
    }
  }

  /**
   * Bulk confirm participants
   */
  async bulkConfirm(ids: string[]): Promise<{
    success: boolean;
    confirmed: number;
    failed: number;
  }> {
    let confirmed = 0;
    let failed = 0;

    for (const id of ids) {
      const result = await this.confirm(id);
      if (result.success) {
        confirmed++;
      } else {
        failed++;
      }
    }

    return { success: true, confirmed, failed };
  }
}

// Export singleton
export const participantManagement = new ParticipantManagementService();

// Export class for testing
export { ParticipantManagementService };
