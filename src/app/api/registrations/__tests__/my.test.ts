// src/app/api/registrations/__tests__/my.test.ts
/**
 * Tests for GET /api/registrations/my (applicant status page data).
 */

import { NextRequest } from 'next/server';
import { GET } from '../my/route';
import { participantManagement } from '@/lib/services/participantManagement';
import { mock } from 'bun:test';

mock.module('@/lib/services/participantManagement', () => ({
  participantManagement: {
    getAllRegistrations: mock(() => Promise.resolve([])),
  },
}));

const makeRequest = (cookies: Record<string, string>) =>
  new NextRequest('http://localhost:3000/api/registrations/my', {
    headers: {
      Cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '),
    },
  });

describe('GET /api/registrations/my', () => {
  beforeEach(() => {
    mock.module('@/lib/services/participantManagement', () => ({
      participantManagement: {
        getAllRegistrations: mock(() => Promise.resolve([])),
      },
    }));
  });

  it('returns 401 when no session cookie is present', async () => {
    const response = await GET(makeRequest({}));
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('UNAUTHENTICATED');
  });

  it('returns the user’s registrations filtered by userId', async () => {
    const mockGetAll = mock(() =>
      Promise.resolve([
        { id: 'r1', tournamentId: 't1', userId: 'user-1', playerName: 'Alice', status: 'approved' },
        { id: 'r2', tournamentId: 't2', userId: 'user-2', playerName: 'Bob', status: 'pending' },
        { id: 'r3', tournamentId: 't3', userId: 'user-1', playerName: 'Alice', status: 'rejected' },
      ])
    );
    mock.module('@/lib/services/participantManagement', () => ({
      participantManagement: { getAllRegistrations: mockGetAll },
    }));

    const response = await GET(makeRequest({ 'appwrite-session': 'valid-jwt' }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(2);
    expect(data.data.every((r: any) => r.userId === 'user-1')).toBe(true);
  });
});
