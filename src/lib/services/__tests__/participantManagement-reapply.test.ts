// src/lib/services/__tests__/participantManagement-reapply.test.ts
/**
 * Tests for student-ID scoping per tournament and re-application after rejection.
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { ParticipantManagementService } from '../participantManagement';

// Minimal mock databases that captures calls so we can assert reuse vs create.
const createdDocs: unknown[] = [];
const updatedDocs: { id: string; data: unknown }[] = [];
const listedDocs: unknown[] = [];

const mockDatabases = {
  listDocuments: mock(() => Promise.resolve({ documents: listedDocs })),
  createDocument: mock(async (_db: string, _coll: string, _id: string, data: unknown) => {
    createdDocs.push(data);
    return { $id: 'doc-' + createdDocs.length, ...data };
  }),
  updateDocument: mock(async (_db: string, _coll: string, id: string, data: unknown) => {
    updatedDocs.push({ id, data });
    return { $id: id, ...data };
  }),
  getDocument: mock(() => Promise.reject({ code: 404 })),
};

mock.module('node-appwrite', () => ({
  Client: class {
    setEndpoint() { return this; }
    setProject() { return this; }
    setKey() { return this; }
  },
  Databases: class {
    constructor() { return mockDatabases; }
    listDocuments(...args: unknown[]) { return mockDatabases.listDocuments(...args); }
    createDocument(...args: unknown[]) { return mockDatabases.createDocument(...args); }
    updateDocument(...args: unknown[]) { return mockDatabases.updateDocument(...args); }
  },
  ID: { unique: () => 'unique-id' },
  Query: { equal: (...a: unknown[]) => a },
}));

const { participantManagement } = await import('../participantManagement');

describe('student ID scoping per tournament', () => {
  const tournamentId = 'tournament-a';
  const registration = {
    tournamentId,
    playerName: 'John Doe',
    email: 'john@example.com',
    studentId: 'STU001',
    university: 'Test University',
    userId: 'user-1',
  };

  beforeEach(() => {
    createdDocs.length = 0;
    updatedDocs.length = 0;
    listedDocs.length = [];
    mockDatabases.listDocuments.mockClear();
    mockDatabases.createDocument.mockClear();
    mockDatabases.updateDocument.mockClear();
  });

  it('allows the same student ID to register for a different tournament', async () => {
    // studentId STU001 already used in tournament-a; now registering for tournament-b
    listedDocs.push({
      $id: 'existing-doc',
      tournamentId: 'tournament-a',
      email: 'john@example.com',
      studentId: 'STU001',
      status: 'registered',
    });

    const service = new ParticipantManagementService();
    const result = await service.register('tournament-b', {
      ...registration,
      tournamentId: 'tournament-b',
    });

    expect(result.success).toBe(true);
    // Should create a new document, not reuse/update the existing one
    expect(createdDocs.length).toBe(1);
    expect(updatedDocs.length).toBe(0);
  });

  it('blocks a duplicate student ID within the same tournament when active', async () => {
    listedDocs.push({
      $id: 'existing-doc',
      tournamentId,
      email: 'john@example.com',
      studentId: 'STU001',
      status: 'registered',
    });

    const service = new ParticipantManagementService();
    const result = await service.register(tournamentId, registration);

    expect(result.success).toBe(false);
    expect(result.error).toContain('already registered');
  });

  it('allows re-application after rejection by reusing the rejected record', async () => {
    listedDocs.push({
      $id: 'rejected-doc',
      tournamentId,
      email: 'john@example.com',
      studentId: 'STU001',
      status: 'rejected',
    });

    const service = new ParticipantManagementService();
    const result = await service.register(tournamentId, registration);

    expect(result.success).toBe(true);
    // Should update the rejected document rather than create a new one
    expect(updatedDocs.length).toBe(1);
    expect(updatedDocs[0].id).toBe('rejected-doc');
    expect(updatedDocs[0].data.status).toBe('registered');
    expect(createdDocs.length).toBe(0);
  });

  it('allows re-application after withdrawal by reusing the withdrawn record', async () => {
    listedDocs.push({
      $id: 'withdrawn-doc',
      tournamentId,
      email: 'john@example.com',
      studentId: 'STU001',
      status: 'withdrawn',
    });

    const service = new ParticipantManagementService();
    const result = await service.register(tournamentId, registration);

    expect(result.success).toBe(true);
    expect(updatedDocs.length).toBe(1);
    expect(updatedDocs[0].id).toBe('withdrawn-doc');
    expect(updatedDocs[0].data.status).toBe('registered');
  });

  it('rejects when email already active but studentId differs', async () => {
    listedDocs.push({
      $id: 'existing-doc',
      tournamentId,
      email: 'john@example.com',
      studentId: 'STU999',
      status: 'registered',
    });

    const service = new ParticipantManagementService();
    const result = await service.register(tournamentId, {
      ...registration,
      studentId: 'STU002',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Email already registered');
  });
});
