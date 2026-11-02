// src/app/api/tournaments/[id]/participants/__tests__/auth-and-validation.test.ts
/**
 * Tests for the authentication and validation behavior of the participants
 * POST route (auth check, roster validation, deadline/capacity enforcement).
 */

import { NextRequest } from 'next/server';
import { POST } from '../route';
import { participantManagement } from '@/lib/services/participantManagement';
import { mock } from 'bun:test';

const tournamentId = 'test-tournament-123';
const mockParams = Promise.resolve({ id: tournamentId });

const defaultTicketRequirement = {
  requiresTicket: false,
  hasPaidTicket: false,
  hasPendingPurchase: false,
};
const mockGetTicketPurchaseRequirement = mock(() => Promise.resolve(defaultTicketRequirement));
const mockHasCheckedInTicketForTournament = mock(() => Promise.resolve(false));

const mockGetTournamentForRegistration = mock(() => Promise.resolve({ configured: false, tournament: null }));

mock.module('@/lib/redis-rate-limit', () => ({
  checkRateLimit: () => Promise.resolve(null),
}));

mock.module('@/lib/tournaments/registrationTournament', () => ({
  getTournamentForRegistration: mockGetTournamentForRegistration,
}));

mock.module('@/lib/tickets', () => ({
  ticketService: {
    getTicketPurchaseRequirement: mockGetTicketPurchaseRequirement,
    hasCheckedInTicketForTournament: mockHasCheckedInTicketForTournament,
  },
}));

const validPayload = {
  playerName: 'John Doe',
  email: 'john@example.com',
  studentId: 'STU123456',
  university: 'Test University',
  teamName: 'Test Team',
  players: JSON.stringify({
    players: [{ name: 'Player 2', studentId: 'STU123457', university: 'Test University' }],
    substitutes: [],
  }),
  additionalInfo: 'Additional info',
};

beforeEach(() => {
  mockGetTicketPurchaseRequirement.mockClear();
  mockGetTicketPurchaseRequirement.mockImplementation(() => Promise.resolve(defaultTicketRequirement));
  mockHasCheckedInTicketForTournament.mockClear();
  mockHasCheckedInTicketForTournament.mockImplementation(() => Promise.resolve(false));
  mockGetTournamentForRegistration.mockClear();
  mockGetTournamentForRegistration.mockImplementation(() => Promise.resolve({ configured: false, tournament: null }));

  mock.module('@/lib/services/participantManagement', () => ({
    participantManagement: {
      listByTournament: mock(() => Promise.resolve({})),
      isRegistered: mock(() => Promise.resolve(false)),
      register: mock(() => Promise.resolve({ success: true, participant: {} })),
    },
  }));
});

describe('POST /api/tournaments/[id]/participants authentication', () => {
  const makeRequest = (cookies: Record<string, string>, body: Record<string, unknown>) =>
    new NextRequest('http://localhost:3000/api/tournaments/test/participants', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        Cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '),
      },
    });

  it('returns 401 when no session cookie is present', async () => {
    mockGetTournamentForRegistration.mockImplementation(() =>
      Promise.resolve({ configured: false, tournament: null })
    );

    const request = makeRequest({}, validPayload);
    const response = await POST(request, { params: mockParams });

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('UNAUTHENTICATED');
  });

  it('returns 401 when session token is invalid', async () => {
    mockGetTournamentForRegistration.mockImplementation(() =>
      Promise.resolve({ configured: false, tournament: null })
    );

    const request = makeRequest({ 'appwrite-session': 'invalid-jwt' }, validPayload);
    const response = await POST(request, { params: mockParams });

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('UNAUTHENTICATED');
  });

  it('registers successfully with a valid session', async () => {
    mockGetTournamentForRegistration.mockImplementation(() =>
      Promise.resolve({ configured: false, tournament: null })
    );

    const mockRegister = mock(() => Promise.resolve({ success: true, participant: {} }));
    mock.module('@/lib/services/participantManagement', () => ({
      participantManagement: {
        listByTournament: mock(() => Promise.resolve({})),
        isRegistered: mock(() => Promise.resolve(false)),
        register: mockRegister,
      },
    }));

    const request = makeRequest({ 'appwrite-session': 'valid-jwt' }, validPayload);
    const response = await POST(request, { params: mockParams });

    expect(response.status).toBe(201);
    expect(mockRegister).toHaveBeenCalled();
  });
});

describe('POST roster validation via tournament doc', () => {
  const makeRequest = (cookies: Record<string, string>, body: Record<string, unknown>) =>
    new NextRequest('http://localhost:3000/api/tournaments/test/participants', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        Cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '),
      },
    });

  it('rejects an invalid roster when tournament requires a team', async () => {
    mockGetTournamentForRegistration.mockImplementation(() =>
      Promise.resolve({
        configured: true,
        tournament: {
          tournamentStatus: 'registration_open',
          status: 'published',
          maxParticipants: 100,
          gameName: 'PUBG Mobile',
          slug: 'pubg-mobile',
        },
      })
    );

    // PUBG requires 3 teammates + captain; this roster has 0 players.
    const badRoster = {
      ...validPayload,
      teamName: 'Bad Team',
      players: JSON.stringify({ players: [], substitutes: [] }),
    };

    const request = makeRequest({ 'appwrite-session': 'valid-jwt' }, badRoster);
    const response = await POST(request, { params: mockParams });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('INVALID_ROSTER');
  });

  it('rejects registration after the deadline has passed', async () => {
    mockGetTournamentForRegistration.mockImplementation(() =>
      Promise.resolve({
        configured: true,
        tournament: {
          tournamentStatus: 'registration_open',
          status: 'published',
          registrationDeadline: new Date(Date.now() - 86400000).toISOString(),
        },
      })
    );

    const request = makeRequest({ 'appwrite-session': 'valid-jwt' }, validPayload);
    const response = await POST(request, { params: mockParams });

    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('REGISTRATION_CLOSED');
  });

  it('rejects registration when tournament is full', async () => {
    mockGetTournamentForRegistration.mockImplementation(() =>
      Promise.resolve({
        configured: true,
        tournament: { tournamentStatus: 'registration_open', status: 'published', maxParticipants: 1 },
      })
    );
    const mockGetActiveCount = mock(() => Promise.resolve(1));
    mock.module('@/lib/services/participantManagement', () => ({
      participantManagement: {
        listByTournament: mock(() => Promise.resolve({})),
        isRegistered: mock(() => Promise.resolve(false)),
        register: mock(() => Promise.resolve({ success: true, participant: {} })),
        getActiveCount: mockGetActiveCount,
      },
    }));

    const request = makeRequest({ 'appwrite-session': 'valid-jwt' }, validPayload);
    const response = await POST(request, { params: mockParams });

    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('TOURNAMENT_FULL');
  });
});
