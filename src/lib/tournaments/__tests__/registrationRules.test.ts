// src/lib/tournaments/__tests__/registrationRules.test.ts
/**
 * Unit tests for registrationRules.ts (pure functions).
 * These run without any Appwrite configuration.
 */

import { describe, it, expect } from 'bun:test';
import {
  findGameForTournament,
  getRegistrationAvailability,
  parseTeamPlayers,
  validateRoster,
  formatGameSpecificFields,
} from '../registrationRules';
import { gamesData } from '@/lib/gamesData';

const pubgGame = gamesData['pubg-mobile']; // team, min 4, max 4
const efootballGame = gamesData['efootball-mobile']; // individual
const duoGame = gamesData['ea-fc-2v2']; // duo, min 2, max 2

describe('findGameForTournament', () => {
  it('matches by slug', () => {
    const game = findGameForTournament({ gameName: 'PUBG Mobile', slug: 'pubg-mobile' });
    expect(game).toBe(pubgGame);
  });

  it('matches by game name', () => {
    const game = findGameForTournament({ gameName: 'eFootball Mobile', slug: '' });
    expect(game).toBe(efootballGame);
  });

  it('matches by slugified name', () => {
    const game = findGameForTournament({ gameName: 'EFC 2V2', slug: '' });
    expect(game).toBe(duoGame);
  });

  it('returns null for unknown tournament', () => {
    const game = findGameForTournament({ gameName: 'Nonexistent Game', slug: 'nonexistent' });
    expect(game).toBeNull();
  });
});

describe('getRegistrationAvailability', () => {
  const now = new Date('2026-10-24T12:00:00Z');

  it('allows registration_open tournaments', () => {
    const result = getRegistrationAvailability(
      { tournamentStatus: 'registration_open', status: 'published' },
      now
    );
    expect(result).toEqual({ open: true });
  });

  it('allows upcoming tournaments', () => {
    const result = getRegistrationAvailability(
      { tournamentStatus: 'upcoming', status: 'published' },
      now
    );
    expect(result).toEqual({ open: true });
  });

  it('blocks completed tournaments', () => {
    const result = getRegistrationAvailability(
      { tournamentStatus: 'completed', status: 'published' },
      now
    );
    expect(result.open).toBe(false);
    expect(result.code).toBe('TOURNAMENT_NOT_OPEN');
  });

  it('blocks draft tournaments', () => {
    const result = getRegistrationAvailability(
      { tournamentStatus: 'registration_open', status: 'draft' },
      now
    );
    expect(result.open).toBe(false);
    expect(result.code).toBe('TOURNAMENT_NOT_OPEN');
  });

  it('blocks past deadline', () => {
    const result = getRegistrationAvailability(
      {
        tournamentStatus: 'registration_open',
        status: 'published',
        registrationDeadline: new Date('2026-10-01T00:00:00Z').toISOString(),
      },
      now
    );
    expect(result.open).toBe(false);
    expect(result.code).toBe('REGISTRATION_CLOSED');
  });

  it('allows future deadline', () => {
    const result = getRegistrationAvailability(
      {
        tournamentStatus: 'registration_open',
        status: 'published',
        registrationDeadline: new Date('2026-12-01T00:00:00Z').toISOString(),
      },
      now
    );
    expect(result).toEqual({ open: true });
  });
});

describe('parseTeamPlayers', () => {
  it('parses valid players JSON', () => {
    const result = parseTeamPlayers(
      JSON.stringify({
        players: [{ name: 'A', studentId: 'STU1', university: 'Uni' }],
        substitutes: [{ name: 'B', studentId: 'STU2', university: 'Uni' }],
      })
    );
    expect(result.players).toHaveLength(1);
    expect(result.substitutes).toHaveLength(1);
  });

  it('returns empty for null/undefined', () => {
    expect(parseTeamPlayers(null)).toEqual({ players: [], substitutes: [] });
    expect(parseTeamPlayers(undefined)).toEqual({ players: [], substitutes: [] });
  });

  it('returns empty for malformed JSON', () => {
    expect(parseTeamPlayers('not json')).toEqual({ players: [], substitutes: [] });
  });

  it('filters out invalid entries', () => {
    const result = parseTeamPlayers(
      JSON.stringify({ players: [{ name: 'A' }], substitutes: 'not-an-array' })
    );
    expect(result.players).toHaveLength(0);
    expect(result.substitutes).toHaveLength(0);
  });
});

describe('validateRoster', () => {
  it('validates a complete PUBG team', () => {
    const result = validateRoster(pubgGame, {
      teamName: 'Elite Squad',
      captainStudentId: 'CAPTAIN01',
      players: JSON.stringify({
        players: [
          { name: 'P2', studentId: 'STU002', university: 'Uni' },
          { name: 'P3', studentId: 'STU003', university: 'Uni' },
          { name: 'P4', studentId: 'STU004', university: 'Uni' },
        ],
        substitutes: [],
      }),
    });
    expect(result.valid).toBe(true);
  });

  it('rejects individual tournaments with players', () => {
    const result = validateRoster(efootballGame, {
      teamName: '',
      captainStudentId: 'CAPTAIN01',
      players: JSON.stringify({ players: [{ name: 'X', studentId: 'STU1', university: 'Uni' }] }),
    });
    expect(result.valid).toBe(false);
    expect(result.code).toBe('INVALID_ROSTER');
  });

  it('rejects duplicate student IDs across team', () => {
    const result = validateRoster(pubgGame, {
      teamName: 'Team',
      captainStudentId: 'STU001',
      players: JSON.stringify({
        players: [{ name: 'P2', studentId: 'STU001', university: 'Uni' }],
        substitutes: [],
      }),
    });
    expect(result.valid).toBe(false);
    expect(result.details).toContain('Student IDs must be unique across the team');
  });

  it('rejects too few teammates for team game', () => {
    const result = validateRoster(pubgGame, {
      teamName: 'Team',
      captainStudentId: 'STU001',
      players: JSON.stringify({ players: [], substitutes: [] }),
    });
    expect(result.valid).toBe(false);
    expect(result.details[0]).toContain('At least 3 additional players required');
  });

  it('requires team name for team games', () => {
    const result = validateRoster(pubgGame, {
      teamName: '',
      captainStudentId: 'STU001',
      players: JSON.stringify({ players: [], substitutes: [] }),
    });
    expect(result.valid).toBe(false);
    expect(result.details).toContain('A team name is required.');
  });

  it('returns valid for unknown game', () => {
    const result = validateRoster(null, {
      teamName: 'Anything',
      captainStudentId: 'STU001',
      players: JSON.stringify({ players: [], substitutes: [] }),
    });
    expect(result.valid).toBe(true);
  });
});

describe('formatGameSpecificFields', () => {
  it('formats fields into a readable string', () => {
    const result = formatGameSpecificFields({ in_game_id: 'PUBG123', preferred_server: 'Asia' });
    expect(result).toContain('In game id: PUBG123');
    expect(result).toContain('Preferred server: Asia');
  });

  it('returns empty string for null/undefined', () => {
    expect(formatGameSpecificFields(null)).toBe('');
    expect(formatGameSpecificFields(undefined)).toBe('');
  });

  it('skips empty values', () => {
    const result = formatGameSpecificFields({ in_game_id: '', preferred_server: 'Asia' });
    expect(result).toContain('Preferred server: Asia');
    expect(result).not.toContain('In game id');
  });
});
