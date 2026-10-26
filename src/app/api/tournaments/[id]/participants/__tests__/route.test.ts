// src/app/api/tournaments/[id]/participants/__tests__/route.test.ts
/**
 * Tests for Tournament Participants API Route
 */

import { NextRequest } from 'next/server';
import { GET, POST } from '../route';
import { participantManagement } from '@/lib/services/participantManagement';
import { mock } from 'bun:test';

// Mock the rate limit module
mock.module('@/lib/redis-rate-limit', () => ({
  checkRateLimit: () => Promise.resolve(null),
}));

// Mock the tournament lookup module so tests never hit Appwrite
const mockGetTournamentForRegistration = mock(() => Promise.resolve({ configured: false, tournament: null }));
mock.module('@/lib/tournaments/registrationTournament', () => ({
  getTournamentForRegistration: mockGetTournamentForRegistration,
}));

// Mock the ticket service so registration tests never hit the database
const defaultTicketRequirement = {
  requiresTicket: false,
  hasPaidTicket: false,
  hasPendingPurchase: false,
};
const mockGetTicketPurchaseRequirement = mock(() => Promise.resolve(defaultTicketRequirement));
const mockHasCheckedInTicketForTournament = mock(() => Promise.resolve(false));

mock.module('@/lib/tickets', () => ({
  ticketService: {
    getTicketPurchaseRequirement: mockGetTicketPurchaseRequirement,
    hasCheckedInTicketForTournament: mockHasCheckedInTicketForTournament,
  },
}));

describe('/api/tournaments/[id]/participants', () => {
  const tournamentId = 'test-tournament-123';
  const mockParams = Promise.resolve({ id: tournamentId });

  beforeEach(() => {
    mockGetTicketPurchaseRequirement.mockClear();
    mockGetTicketPurchaseRequirement.mockImplementation(() => Promise.resolve(defaultTicketRequirement));
    mockHasCheckedInTicketForTournament.mockClear();
    mockHasCheckedInTicketForTournament.mockImplementation(() => Promise.resolve(false));
    mockGetTournamentForRegistration.mockClear();
    mockGetTournamentForRegistration.mockImplementation(() => Promise.resolve({ configured: false, tournament: null }));

    // Reset all mocks before each test
    mock.module('@/lib/services/participantManagement', () => ({
      participantManagement: {
        listByTournament: mock(() => Promise.resolve({})),
        isRegistered: mock(() => Promise.resolve(false)),
        register: mock(() => Promise.resolve({ success: true, participant: {} })),
      },
    }));
  });

  describe('GET /api/tournaments/[id]/participants', () => {
    it('should return participants list successfully', async () => {
      const mockParticipants = {
        participants: [
          {
            id: '1',
            playerName: 'John Doe',
            email: 'john@example.com',
            status: 'registered',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 50,
        totalPages: 1,
      };

      const mockListByTournament = mock(() => Promise.resolve(mockParticipants));
      mock.module('@/lib/services/participantManagement', () => ({
        participantManagement: {
          listByTournament: mockListByTournament,
          isRegistered: mock(() => Promise.resolve(false)),
          register: mock(() => Promise.resolve({ success: true, participant: {} })),
        },
      }));

      const request = new NextRequest('http://localhost:3000/api/tournaments/test/participants');
      const response = await GET(request, { params: mockParams });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockParticipants);
    });

    it('should handle search and filter parameters', async () => {
      const mockParticipants = { participants: [], total: 0, page: 1, pageSize: 50, totalPages: 0 };
      const mockListByTournament = mock(() => Promise.resolve(mockParticipants));
      mock.module('@/lib/services/participantManagement', () => ({
        participantManagement: {
          listByTournament: mockListByTournament,
          isRegistered: mock(() => Promise.resolve(false)),
          register: mock(() => Promise.resolve({ success: true, participant: {} })),
        },
      }));

      const request = new NextRequest(
        'http://localhost:3000/api/tournaments/test/participants?status=confirmed&search=john&page=2&pageSize=10'
      );
      const response = await GET(request, { params: mockParams });

      expect(response.status).toBe(200);
    });

    it('should handle errors gracefully', async () => {
      const mockListByTournament = mock(() => Promise.reject(new Error('Database error')));
      mock.module('@/lib/services/participantManagement', () => ({
        participantManagement: {
          listByTournament: mockListByTournament,
          isRegistered: mock(() => Promise.resolve(false)),
          register: mock(() => Promise.resolve({ success: true, participant: {} })),
        },
      }));

      const request = new NextRequest('http://localhost:3000/api/tournaments/test/participants');
      const response = await GET(request, { params: mockParams });

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('INTERNAL_ERROR');
    });
  });

  describe('POST /api/tournaments/[id]/participants', () => {
    const validPayload = {
      playerName: 'John Doe',
      email: 'john@example.com',
      studentId: 'STU123456',
      university: 'Test University',
      teamName: 'Test Team',
      players: JSON.stringify({
        players: [
          { name: 'Player 2', studentId: 'STU123457', university: 'Test University' },
        ],
        substitutes: [],
      }),
      additionalInfo: 'Additional info',
    };

    it('should register a new participant successfully', async () => {
      const mockParticipant = {
        id: 'new-participant-123',
        tournamentId,
        playerName: 'John Doe',
        email: 'john@example.com',
        status: 'registered',
        registrationDate: new Date().toISOString(),
      };

      const mockIsRegistered = mock(() => Promise.resolve(false));
      const mockRegister = mock(() => Promise.resolve({
        success: true,
        participant: mockParticipant,
      }));

      mock.module('@/lib/services/participantManagement', () => ({
        participantManagement: {
          listByTournament: mock(() => Promise.resolve({})),
          isRegistered: mockIsRegistered,
          register: mockRegister,
        },
      }));

      const request = new NextRequest('http://localhost:3000/api/tournaments/test/participants', {
        method: 'POST',
        body: JSON.stringify(validPayload),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request, { params: mockParams });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockParticipant);
    });

    it('should reject registration when the tournament requires a ticket that has not been purchased', async () => {
      const mockIsRegistered = mock(() => Promise.resolve(false));
      const mockRegister = mock(() => Promise.resolve({ success: true, participant: {} }));

      mock.module('@/lib/services/participantManagement', () => ({
        participantManagement: {
          listByTournament: mock(() => Promise.resolve({})),
          isRegistered: mockIsRegistered,
          register: mockRegister,
        },
      }));

      mockGetTicketPurchaseRequirement.mockImplementation(() => Promise.resolve({
        requiresTicket: true,
        hasPaidTicket: false,
        hasPendingPurchase: false,
      }));

      const request = new NextRequest('http://localhost:3000/api/tournaments/test/participants', {
        method: 'POST',
        body: JSON.stringify(validPayload),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request, { params: mockParams });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('TICKET_REQUIRED');
      expect(data.ticketUrl).toBe(`/events/${tournamentId}`);
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('should reject registration while ticket payment is still pending', async () => {
      const mockRegister = mock(() => Promise.resolve({ success: true, participant: {} }));

      mock.module('@/lib/services/participantManagement', () => ({
        participantManagement: {
          listByTournament: mock(() => Promise.resolve({})),
          isRegistered: mock(() => Promise.resolve(false)),
          register: mockRegister,
        },
      }));

      mockGetTicketPurchaseRequirement.mockImplementation(() => Promise.resolve({
        requiresTicket: true,
        hasPaidTicket: false,
        hasPendingPurchase: true,
      }));

      const request = new NextRequest('http://localhost:3000/api/tournaments/test/participants', {
        method: 'POST',
        body: JSON.stringify(validPayload),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request, { params: mockParams });

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('TICKET_PAYMENT_PENDING');
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('should allow registration when the buyer has a confirmed paid ticket', async () => {
      const mockParticipant = {
        id: 'paid-participant-123',
        tournamentId,
        playerName: 'John Doe',
        email: 'john@example.com',
        status: 'registered',
      };

      mock.module('@/lib/services/participantManagement', () => ({
        participantManagement: {
          listByTournament: mock(() => Promise.resolve({})),
          isRegistered: mock(() => Promise.resolve(false)),
          register: mock(() => Promise.resolve({ success: true, participant: mockParticipant })),
        },
      }));

      mockGetTicketPurchaseRequirement.mockImplementation(() => Promise.resolve({
        requiresTicket: true,
        hasPaidTicket: true,
        hasPendingPurchase: false,
      }));

      const request = new NextRequest('http://localhost:3000/api/tournaments/test/participants', {
        method: 'POST',
        body: JSON.stringify(validPayload),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request, { params: mockParams });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should fail closed when the ticket purchase cannot be verified', async () => {
      const mockRegister = mock(() => Promise.resolve({ success: true, participant: {} }));

      mock.module('@/lib/services/participantManagement', () => ({
        participantManagement: {
          listByTournament: mock(() => Promise.resolve({})),
          isRegistered: mock(() => Promise.resolve(false)),
          register: mockRegister,
        },
      }));

      mockGetTicketPurchaseRequirement.mockImplementation(() => Promise.resolve({
        ...defaultTicketRequirement,
        checkFailed: true,
      }));

      const request = new NextRequest('http://localhost:3000/api/tournaments/test/participants', {
        method: 'POST',
        body: JSON.stringify(validPayload),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request, { params: mockParams });

      expect(response.status).toBe(503);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('TICKET_CHECK_FAILED');
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('should reject registration for already registered email', async () => {
      const mockIsRegistered = mock(() => Promise.resolve(true));
      const mockRegister = mock(() => Promise.resolve({ success: true, participant: {} }));

      mock.module('@/lib/services/participantManagement', () => ({
        participantManagement: {
          listByTournament: mock(() => Promise.resolve({})),
          isRegistered: mockIsRegistered,
          register: mockRegister,
        },
      }));

      const request = new NextRequest('http://localhost:3000/api/tournaments/test/participants', {
        method: 'POST',
        body: JSON.stringify(validPayload),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request, { params: mockParams });

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('ALREADY_REGISTERED');
    });

    it('should validate required fields', async () => {
      const invalidPayload = {
        email: 'john@example.com',
        // Missing playerName and studentId
      };

      const request = new NextRequest('http://localhost:3000/api/tournaments/test/participants', {
        method: 'POST',
        body: JSON.stringify(invalidPayload),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request, { params: mockParams });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('VALIDATION_ERROR');
      expect(data.message).toBe('Invalid request payload');
      expect(data.details).toBeDefined();
    });

    it('should validate email format', async () => {
      const invalidPayload = {
        ...validPayload,
        email: 'invalid-email',
      };

      const request = new NextRequest('http://localhost:3000/api/tournaments/test/participants', {
        method: 'POST',
        body: JSON.stringify(invalidPayload),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request, { params: mockParams });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('VALIDATION_ERROR');
    });

    it('should handle service registration failures', async () => {
      const mockIsRegistered = mock(() => Promise.resolve(false));
      const mockRegister = mock(() => Promise.resolve({
        success: false,
        error: 'Student ID already exists',
      }));

      mock.module('@/lib/services/participantManagement', () => ({
        participantManagement: {
          listByTournament: mock(() => Promise.resolve({})),
          isRegistered: mockIsRegistered,
          register: mockRegister,
        },
      }));

      const request = new NextRequest('http://localhost:3000/api/tournaments/test/participants', {
        method: 'POST',
        body: JSON.stringify(validPayload),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request, { params: mockParams });

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('CONFLICT');
      expect(data.message).toBe('Student ID already exists');
    });

    it('should handle invalid JSON', async () => {
      const request = new NextRequest('http://localhost:3000/api/tournaments/test/participants', {
        method: 'POST',
        body: 'invalid json',
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request, { params: mockParams });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('INVALID_JSON');
    });

    it('should accept team players JSON string', async () => {
      const teamPayload = {
        ...validPayload,
        players: JSON.stringify({
          players: [
            { name: 'Player 2', studentId: 'STU123457', university: 'Test University' },
            { name: 'Player 3', studentId: 'STU123458', university: 'Test University' },
          ],
          substitutes: [
            { name: 'Sub 1', studentId: 'STU123459', university: 'Test University' },
          ],
        }),
      };

      const mockParticipant = {
        id: 'team-participant-123',
        tournamentId,
        playerName: 'John Doe',
        email: 'john@example.com',
        status: 'registered',
      };

      const mockIsRegistered = mock(() => Promise.resolve(false));
      const mockRegister = mock(() => Promise.resolve({
        success: true,
        participant: mockParticipant,
      }));

      mock.module('@/lib/services/participantManagement', () => ({
        participantManagement: {
          listByTournament: mock(() => Promise.resolve({})),
          isRegistered: mockIsRegistered,
          register: mockRegister,
        },
      }));

      const request = new NextRequest('http://localhost:3000/api/tournaments/test/participants', {
        method: 'POST',
        body: JSON.stringify(teamPayload),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request, { params: mockParams });

      expect(response.status).toBe(201);
    });

    it('should handle internal server errors', async () => {
      const mockIsRegistered = mock(() => Promise.reject(new Error('Database connection failed')));

      mock.module('@/lib/services/participantManagement', () => ({
        participantManagement: {
          listByTournament: mock(() => Promise.resolve({})),
          isRegistered: mockIsRegistered,
          register: mock(() => Promise.resolve({ success: true, participant: {} })),
        },
      }));

      const request = new NextRequest('http://localhost:3000/api/tournaments/test/participants', {
        method: 'POST',
        body: JSON.stringify(validPayload),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request, { params: mockParams });

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('INTERNAL_ERROR');
    });

    it('should return 404 when the tournament does not exist', async () => {
      mockGetTournamentForRegistration.mockImplementation(() =>
        Promise.resolve({ configured: true, tournament: null })
      );

      const mockRegister = mock(() => Promise.resolve({ success: true, participant: {} }));
      mock.module('@/lib/services/participantManagement', () => ({
        participantManagement: {
          listByTournament: mock(() => Promise.resolve({})),
          isRegistered: mock(() => Promise.resolve(false)),
          register: mockRegister,
        },
      }));

      const request = new NextRequest('http://localhost:3000/api/tournaments/test/participants', {
        method: 'POST',
        body: JSON.stringify(validPayload),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request, { params: mockParams });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('TOURNAMENT_NOT_FOUND');
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('should reject registration when registration is not open', async () => {
      mockGetTournamentForRegistration.mockImplementation(() =>
        Promise.resolve({
          configured: true,
          tournament: { tournamentStatus: 'completed', status: 'published' },
        })
      );

      const mockRegister = mock(() => Promise.resolve({ success: true, participant: {} }));
      mock.module('@/lib/services/participantManagement', () => ({
        participantManagement: {
          listByTournament: mock(() => Promise.resolve({})),
          isRegistered: mock(() => Promise.resolve(false)),
          register: mockRegister,
        },
      }));

      const request = new NextRequest('http://localhost:3000/api/tournaments/test/participants', {
        method: 'POST',
        body: JSON.stringify(validPayload),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request, { params: mockParams });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('TOURNAMENT_NOT_OPEN');
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('should reject registration after the deadline has passed', async () => {
      mockGetTournamentForRegistration.mockImplementation(() =>
        Promise.resolve({
          configured: true,
          tournament: { tournamentStatus: 'registration_open', status: 'published', registrationDeadline: new Date(Date.now() - 86400000).toISOString() },
        })
      );

      const mockRegister = mock(() => Promise.resolve({ success: true, participant: {} }));
      mock.module('@/lib/services/participantManagement', () => ({
        participantManagement: {
          listByTournament: mock(() => Promise.resolve({})),
          isRegistered: mock(() => Promise.resolve(false)),
          register: mockRegister,
        },
      }));

      const request = new NextRequest('http://localhost:3000/api/tournaments/test/participants', {
        method: 'POST',
        body: JSON.stringify(validPayload),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request, { params: mockParams });

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('REGISTRATION_CLOSED');
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('should reject registration when the tournament is full', async () => {
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

      const request = new NextRequest('http://localhost:3000/api/tournaments/test/participants', {
        method: 'POST',
        body: JSON.stringify(validPayload),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request, { params: mockParams });

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('TOURNAMENT_FULL');
    });

    it('should reject an invalid roster for a team tournament', async () => {
      mockGetTournamentForRegistration.mockImplementation(() =>
        Promise.resolve({
          configured: true,
          tournament: { tournamentStatus: 'registration_open', status: 'published', maxParticipants: 100, gameName: 'PUBG Mobile', slug: 'pubg-mobile' },
        })
      );
      const mockGetActiveCount = mock(() => Promise.resolve(0));
      mock.module('@/lib/services/participantManagement', () => ({
        participantManagement: {
          listByTournament: mock(() => Promise.resolve({})),
          isRegistered: mock(() => Promise.resolve(false)),
          register: mock(() => Promise.resolve({ success: true, participant: {} })),
          getActiveCount: mockGetActiveCount,
        },
      }));

      // PUBG requires 3 teammates + captain; this roster has 0 players.
      const badRosterPayload = {
        ...validPayload,
        teamName: 'Bad Team',
        players: JSON.stringify({ players: [], substitutes: [] }),
      };

      const request = new NextRequest('http://localhost:3000/api/tournaments/test/participants', {
        method: 'POST',
        body: JSON.stringify(badRosterPayload),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request, { params: mockParams });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('INVALID_ROSTER');
    });
  });
});