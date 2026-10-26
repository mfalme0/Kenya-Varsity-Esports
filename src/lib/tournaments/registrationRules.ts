import { gamesData, Game } from '@/lib/gamesData';
import type { PlayerInfo } from '@/components/tournament-registration/schema';

/**
 * Pure (no I/O) helpers shared by the registration form and the API route.
 *
 * Keeping these in one place means the client and the server enforce the same
 * tournament availability and team-roster rules.
 */

export interface TournamentLike {
  gameName?: string | null;
  slug?: string | null;
  status?: string | null;
  tournamentStatus?: string | null;
  registrationDeadline?: string | null;
  registrationEndDate?: string | null;
  maxParticipants?: number | null;
}

export interface TeamPlayersPayload {
  players: PlayerInfo[];
  substitutes: PlayerInfo[];
}

/**
 * Resolve the `gamesData` entry that a CMS tournament belongs to. Tournaments
 * are matched by slug first, then by game name, then by a slugified name.
 */
export function findGameForTournament(
  tournament: Pick<TournamentLike, 'gameName' | 'slug'>
): Game | null {
  const gameName = (tournament.gameName || '').trim().toLowerCase();
  const slug = (tournament.slug || '').trim().toLowerCase();

  const match = Object.values(gamesData).find((game) => {
    const name = game.name.trim().toLowerCase();
    const gameSlug = game.slug.trim().toLowerCase();
    return (
      (slug !== '' && gameSlug === slug) ||
      (gameName !== '' && name === gameName) ||
      (gameName !== '' && gameSlug === gameName.replace(/\s+/g, '-'))
    );
  });

  return match ?? null;
}

export type RegistrationAvailability =
  | { open: true }
  | {
      open: false;
      code: 'TOURNAMENT_NOT_OPEN' | 'REGISTRATION_CLOSED';
      message: string;
    };

/**
 * Check whether a tournament is currently accepting registrations.
 */
export function getRegistrationAvailability(
  tournament: TournamentLike,
  now: Date = new Date()
): RegistrationAvailability {
  if (tournament.status && tournament.status !== 'published') {
    return {
      open: false,
      code: 'TOURNAMENT_NOT_OPEN',
      message: 'This tournament is not available for registration.',
    };
  }

  const status = (tournament.tournamentStatus || '').trim().toLowerCase();
  if (status && status !== 'registration_open' && status !== 'upcoming') {
    return {
      open: false,
      code: 'TOURNAMENT_NOT_OPEN',
      message: 'Registration for this tournament is not open.',
    };
  }

  const deadlineRaw = tournament.registrationDeadline || tournament.registrationEndDate;
  if (deadlineRaw) {
    const deadline = new Date(deadlineRaw);
    if (!Number.isNaN(deadline.getTime()) && deadline.getTime() < now.getTime()) {
      return {
        open: false,
        code: 'REGISTRATION_CLOSED',
        message: 'The registration deadline for this tournament has passed.',
      };
    }
  }

  return { open: true };
}

function asPlayerArray(value: unknown): PlayerInfo[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
    .map((entry) => ({
      name: typeof entry.name === 'string' ? entry.name : '',
      studentId: typeof entry.studentId === 'string' ? entry.studentId : '',
      university: typeof entry.university === 'string' ? entry.university : '',
      inGameId: typeof entry.inGameId === 'string' ? entry.inGameId : undefined,
      additionalInfo:
        typeof entry.additionalInfo === 'string' ? entry.additionalInfo : undefined,
    }));
}

/**
 * Parse the `players` JSON string stored on a registration. Never throws.
 */
export function parseTeamPlayers(raw: string | null | undefined): TeamPlayersPayload {
  if (!raw) return { players: [], substitutes: [] };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { players: [], substitutes: [] };
    }
    return {
      players: asPlayerArray((parsed as Record<string, unknown>).players),
      substitutes: asPlayerArray((parsed as Record<string, unknown>).substitutes),
    };
  } catch {
    return { players: [], substitutes: [] };
  }
}

export interface RosterValidationResult {
  valid: boolean;
  code?: 'INVALID_ROSTER';
  message?: string;
  details?: string[];
}

/**
 * Validate a team roster against the game's team-size rules and the captain's
 * student ID. Used by the API route; the form validates the same rules through
 * the zod schema.
 */
export function validateRoster(
  game: Game | null,
  input: {
    teamName?: string | null;
    captainStudentId?: string | null;
    players?: string | null;
  }
): RosterValidationResult {
  const team = parseTeamPlayers(input.players);

  if (!game) {
    // Unknown game: only enforce structural validity.
    return { valid: true };
  }

  const details: string[] = [];
  const isIndividual = game.rules.tournamentType === 'individual';

  if (isIndividual) {
    if (team.players.length > 0 || team.substitutes.length > 0) {
      details.push('Individual tournaments do not accept team members.');
    }
  } else {
    const requiredPlayers = Math.max(0, game.rules.minTeamSize - 1);
    const maxPlayers = Math.max(0, game.rules.maxTeamSize - 1);
    const maxSubstitutes = game.rules.maxSubstitutes || 0;

    if (!input.teamName || input.teamName.trim().length < 2) {
      details.push('A team name is required.');
    }
    if (team.players.length < requiredPlayers) {
      details.push(
        `At least ${requiredPlayers} teammates are required (${requiredPlayers + 1} players including the captain).`
      );
    }
    if (team.players.length > maxPlayers) {
      details.push(`A maximum of ${maxPlayers} teammates is allowed.`);
    }
    if (team.substitutes.length > maxSubstitutes) {
      details.push(`A maximum of ${maxSubstitutes} substitutes is allowed.`);
    }
  }

  const invalidMember = [...team.players, ...team.substitutes].find(
    (member) =>
      member.name.trim() === '' ||
      member.studentId.trim() === '' ||
      member.university.trim() === ''
  );
  if (invalidMember) {
    details.push('Every team member must have a name, student ID, and university.');
  }

  const seen = new Set<string>();
  const captainId = (input.captainStudentId || '').trim().toLowerCase();
  if (captainId) seen.add(captainId);

  for (const member of [...team.players, ...team.substitutes]) {
    const id = member.studentId.trim().toLowerCase();
    if (!id) continue;
    if (seen.has(id)) {
      details.push('Student IDs must be unique across the team.');
      break;
    }
    seen.add(id);
  }

  if (details.length > 0) {
    return {
      valid: false,
      code: 'INVALID_ROSTER',
      message: details[0],
      details,
    };
  }

  return { valid: true };
}

/**
 * Format submitted game-specific fields for storage in the existing
 * `additionalInfo` text column (no schema change required).
 */
export function formatGameSpecificFields(fields: Record<string, unknown> | null | undefined): string {
  if (!fields) return '';
  const entries = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${String(value).trim()}`);

  return entries.length > 0 ? `[Game details] ${entries.join(' | ')}` : '';
}
