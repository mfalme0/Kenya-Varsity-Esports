// src/lib/tournaments/__tests__/approveRegistration-rejection.test.ts
/**
 * Tests for rejection behavior in approveRegistration.ts.
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';

const storedRegistration = {
  $id: 'registration-1',
  tournamentId: 'tournament-1',
  playerName: 'Legacy Player',
  email: 'player@example.com',
  userId: 'user-1',
  status: 'registered',
  players: JSON.stringify({ players: [], substitutes: [] }),
  registrationDate: '2026-10-15T00:00:00.000Z',
};

const mockGetDocument = mock(() => Promise.resolve(storedRegistration));
const mockUpdateDocument = mock(() => Promise.resolve({}));
const mockSendEmail = mock(() => Promise.resolve({}));

mock.module('node-appwrite', () => ({
  Client: class {
    setEndpoint() { return this; }
    setProject() { return this; }
    setKey() { return this; }
  },
  Databases: class {
    getDocument(...args: unknown[]) { return mockGetDocument(...(args as [])); }
    updateDocument(...args: unknown[]) { return mockUpdateDocument(...(args as [])); }
    createDocument(...args: unknown[]) { return Promise.resolve({}); }
  },
  Permission: { read: () => '', update: () => '', delete: () => '' },
  Role: { any: () => '', users: () => '', team: () => '' },
}));

mock.module('mailtrap', () => ({
  MailtrapClient: class {
    send = mockSendEmail;
  },
}));

mock.module('@/lib/tickets', () => ({
  ticketService: {
    getTicketPurchaseRequirement: mock(() =>
      Promise.resolve({ requiresTicket: false, hasPaidTicket: false, hasPendingPurchase: false })
    ),
  },
}));

const { approveRegistration } = await import('../approveRegistration');

describe('approveRegistration rejection', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT = 'https://example.com/v1';
    process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID = 'test-project';
    process.env.APPWRITE_API_KEY = 'test-key';
    process.env.NEXT_PUBLIC_APPWRITE_DB_ID = 'test-db';
    delete process.env.MAILTRAP_TOKEN;

    mockGetDocument.mockClear();
    mockGetDocument.mockImplementation(() => Promise.resolve(storedRegistration));
    mockUpdateDocument.mockClear();
    mockSendEmail.mockClear();
  });

  it('updates status to rejected and does not create a participant', async () => {
    const result = await approveRegistration({
      registrationId: 'registration-1',
      status: 'rejected',
      registration: { tournamentId: 'tournament-1', playerName: 'Legacy Player', email: 'player@example.com' },
      tournamentTitle: 'Test Tournament',
    });

    expect(result.success).toBe(true);
    expect(result.participantCreated).toBe(false);
    expect(mockUpdateDocument).toHaveBeenCalledWith(
      'test-db',
      'tournament_registrations',
      'registration-1',
      { status: 'rejected' }
    );
  });

  it('sends a rejection email to the applicant when Mailtrap is configured', async () => {
    process.env.MAILTRAP_TOKEN = 'test-token';

    const result = await approveRegistration({
      registrationId: 'registration-1',
      status: 'rejected',
      registration: { tournamentId: 'tournament-1', playerName: 'Legacy Player', email: 'player@example.com' },
      tournamentTitle: 'Test Tournament',
    });

    expect(result.success).toBe(true);
    expect(mockSendEmail).toHaveBeenCalled();
    const emailArgs = mockSendEmail.mock.calls[0][0];
    expect(emailArgs.to[0].email).toBe('player@example.com');
    expect(emailArgs.subject).toContain('Test Tournament');
  });

  it('does not crash when Mailtrap is not configured', async () => {
    delete process.env.MAILTRAP_TOKEN;

    const result = await approveRegistration({
      registrationId: 'registration-1',
      status: 'rejected',
      registration: { tournamentId: 'tournament-1', playerName: 'Legacy Player', email: 'player@example.com' },
      tournamentTitle: 'Test Tournament',
    });

    expect(result.success).toBe(true);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
