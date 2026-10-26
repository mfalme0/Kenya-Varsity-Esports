import { describe, test, expect } from 'bun:test';
import { z } from 'zod';
import { gamesData } from '@/lib/gamesData';
import {
  PlayerInfoSchema,
  TeamDataSchema,
  TournamentRegistrationFormSchema,
  TournamentRegistrationPayloadSchema,
  createTournamentRegistrationSchema,
  validatePlayerInfo,
  validateTeamData,
  validateTournamentPayload,
  createGameValidator,
  getRequiredPlayerCount,
  getMaxPlayerCount,
  getMaxSubstitutes,
  isGameIndividual,
  getGameSpecificRequiredFields,
  validateStudentIdFormat,
  validateTeamName,
  checkDuplicatePlayerIds,
} from '../schema';

// Test data fixtures
const validPlayerInfo = {
  name: 'John Doe',
  studentId: 'STU123456',
  university: 'Test University',
  inGameId: 'johndoe123',
  additionalInfo: 'Test info',
};

const invalidPlayerInfo = {
  name: '',
  studentId: '',
  university: '',
};

const teamPlayers = [
  { name: 'Player 1', studentId: 'STU001', university: 'Uni 1' },
  { name: 'Player 2', studentId: 'STU002', university: 'Uni 2' },
  { name: 'Player 3', studentId: 'STU003', university: 'Uni 3' },
];

const teamSubstitutes = [
  { name: 'Sub 1', studentId: 'SUB001', university: 'Uni 1' },
];

describe('PlayerInfoSchema', () => {
  test('should validate valid player info', () => {
    const result = PlayerInfoSchema.safeParse(validPlayerInfo);
    expect(result.success).toBe(true);
  });

  test('should reject invalid player info', () => {
    const result = PlayerInfoSchema.safeParse(invalidPlayerInfo);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(3);
    }
  });

  test('should allow optional fields to be missing', () => {
    const minimalPlayer = {
      name: 'Jane Doe',
      studentId: 'STU789012',
      university: 'Another University',
    };
    const result = PlayerInfoSchema.safeParse(minimalPlayer);
    expect(result.success).toBe(true);
  });
});

describe('TeamDataSchema', () => {
  test('should validate complete team data', () => {
    const teamData = {
      players: teamPlayers,
      substitutes: teamSubstitutes,
    };
    const result = TeamDataSchema.safeParse(teamData);
    expect(result.success).toBe(true);
  });

  test('should validate with empty substitutes', () => {
    const teamData = {
      players: teamPlayers,
      substitutes: [],
    };
    const result = TeamDataSchema.safeParse(teamData);
    expect(result.success).toBe(true);
  });
});

describe('TournamentRegistrationFormSchema', () => {
  test('should validate basic form data', () => {
    const formData = {
      tournamentId: 'tournament-123',
      teamName: 'Test Team',
      additionalInfo: 'Test additional info',
      players: [validPlayerInfo],
      substitutes: [],
      gameSpecificFields: {},
    };
    const result = TournamentRegistrationFormSchema.safeParse(formData);
    expect(result.success).toBe(true);
  });

  test('should validate form with optional fields missing', () => {
    const formData = {
      tournamentId: 'tournament-123',
    };
    const result = TournamentRegistrationFormSchema.safeParse(formData);
    expect(result.success).toBe(true);
  });
});

describe('TournamentRegistrationPayloadSchema', () => {
  test('should validate complete payload', () => {
    const payload = {
      tournamentId: 'tournament-123',
      playerName: 'Captain Name',
      email: 'captain@test.com',
      studentId: 'CAP001',
      university: 'Captain University',
      teamName: 'Test Team',
      players: JSON.stringify({ players: teamPlayers, substitutes: [] }),
      additionalInfo: 'Test info',
      status: 'pending' as const,
      registrationDate: '2024-01-01T00:00:00.000Z',
      userId: 'user-123',
    };
    const result = TournamentRegistrationPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  test('should reject invalid email', () => {
    const payload = {
      tournamentId: 'tournament-123',
      playerName: 'Captain Name',
      email: 'invalid-email',
      studentId: 'CAP001',
      status: 'pending' as const,
      registrationDate: '2024-01-01T00:00:00.000Z',
      userId: 'user-123',
    };
    const result = TournamentRegistrationPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  test('should reject invalid status', () => {
    const payload = {
      tournamentId: 'tournament-123',
      playerName: 'Captain Name',
      email: 'captain@test.com',
      studentId: 'CAP001',
      status: 'invalid-status' as any,
      registrationDate: '2024-01-01T00:00:00.000Z',
      userId: 'user-123',
    };
    const result = TournamentRegistrationPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe('createTournamentRegistrationSchema', () => {
  const pubgGame = gamesData['pubg-mobile'];
  const efootballGame = gamesData['efootball-mobile'];

  test('should create schema for team-based game (PUBG)', () => {
    const schema = createTournamentRegistrationSchema(pubgGame);
    expect(schema).toBeDefined();

    // Test valid team data
    const validTeamData = {
      tournamentId: 'tournament-123',
      teamName: 'Test Team',
      players: teamPlayers,
      substitutes: [],
      gameSpecificFields: { in_game_id: 'PUBG123456', preferred_server: 'Asia' },
    };

    const result = schema.safeParse(validTeamData);
    expect(result.success).toBe(true);
  });

  test('should create schema for individual game (eFootball)', () => {
    const schema = createTournamentRegistrationSchema(efootballGame);
    expect(schema).toBeDefined();

    // Test valid individual data (no players; game-specific fields collected)
    const validIndividualData = {
      tournamentId: 'tournament-123',
      players: [],
      substitutes: [],
      gameSpecificFields: {
        in_game_username: 'efootball_user',
        player_id: 'EFC123456',
        skill_level: 'Intermediate',
      },
    };

    const result = schema.safeParse(validIndividualData);
    expect(result.success).toBe(true);
  });

  test('should reject players for individual games', () => {
    const schema = createTournamentRegistrationSchema(efootballGame);

    const invalidIndividualData = {
      tournamentId: 'tournament-123',
      players: [validPlayerInfo],
      gameSpecificFields: { in_game_username: 'user', player_id: 'EFC1', skill_level: 'Beginner' },
    };

    const result = schema.safeParse(invalidIndividualData);
    expect(result.success).toBe(false);
  });

  test('should require minimum players for team games', () => {
    const schema = createTournamentRegistrationSchema(pubgGame);

    // Test with insufficient players (PUBG needs 3 teammates + captain = 4 total)
    const insufficientTeamData = {
      tournamentId: 'tournament-123',
      teamName: 'Test Team',
      players: [],
      substitutes: [],
    };

    const result = schema.safeParse(insufficientTeamData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) =>
        issue.message.includes('At least 3 additional players required')
      )).toBe(true);
    }
  });

  test('should reject duplicate student IDs across the team', () => {
    const schema = createTournamentRegistrationSchema(pubgGame, {
      captainStudentId: 'STU001',
    });

    const duplicateData = {
      tournamentId: 'tournament-123',
      teamName: 'Test Team',
      players: [
        { name: 'Player 2', studentId: 'STU002', university: 'Uni A' },
        { name: 'Player 3', studentId: 'STU001', university: 'Uni B' }, // Duplicate with captain
      ],
      substitutes: [],
    };

    const result = schema.safeParse(duplicateData);
    expect(result.success).toBe(false);
  });

  test('should require team name for team games', () => {
    const schema = createTournamentRegistrationSchema(pubgGame);

    const missingTeamName = {
      tournamentId: 'tournament-123',
      teamName: '',
      players: teamPlayers,
      substitutes: [],
    };

    const result = schema.safeParse(missingTeamName);
    expect(result.success).toBe(false);
  });

  test('should validate game-specific required fields', () => {
    const schema = createTournamentRegistrationSchema(pubgGame);

    // Test missing required game-specific fields
    const missingFieldsData = {
      tournamentId: 'tournament-123',
      teamName: 'Test Team',
      players: teamPlayers,
      substitutes: [],
      gameSpecificFields: {},
    };

    const result = schema.safeParse(missingFieldsData);
    expect(result.success).toBe(false);
  });
});

describe('Utility functions', () => {
  test('validatePlayerInfo should work correctly', () => {
    expect(validatePlayerInfo(validPlayerInfo)).toBe(true);
    expect(validatePlayerInfo(invalidPlayerInfo)).toBe(false);
    expect(validatePlayerInfo('not-an-object')).toBe(false);
  });

  test('validateTeamData should work correctly', () => {
    const validTeamData = {
      players: teamPlayers,
      substitutes: teamSubstitutes,
    };
    
    expect(validateTeamData(validTeamData)).toBe(true);
    expect(validateTeamData('not-an-object')).toBe(false);
  });

  test('validateTournamentPayload should work correctly', () => {
    const validPayload = {
      tournamentId: 'tournament-123',
      playerName: 'Captain Name',
      email: 'captain@test.com',
      studentId: 'CAP001',
      status: 'pending' as const,
      registrationDate: '2024-01-01T00:00:00.000Z',
      userId: 'user-123',
    };
    
    expect(validateTournamentPayload(validPayload)).toBe(true);
    expect(validateTournamentPayload('not-an-object')).toBe(false);
  });

  test('createGameValidator should work correctly', () => {
    const game = gamesData['pubg-mobile'];
    const validator = createGameValidator(game);
    
    expect(validator.schema).toBeDefined();
    expect(typeof validator.validate).toBe('function');
    
    const validData = {
      tournamentId: 'tournament-123',
      teamName: 'Test Team',
      players: teamPlayers,
      substitutes: [],
      gameSpecificFields: { in_game_id: 'PUBG123456', preferred_server: 'Asia' },
    };
    
    const result = validator.validate(validData);
    expect(result.success).toBe(true);
  });

  test('getRequiredPlayerCount should work correctly', () => {
    const pubgGame = gamesData['pubg-mobile'];
    const efootballGame = gamesData['efootball-mobile'];
    
    expect(getRequiredPlayerCount(pubgGame)).toBe(3); // 4 total - 1 captain
    expect(getRequiredPlayerCount(efootballGame)).toBe(0); // Individual
  });

  test('getMaxPlayerCount should work correctly', () => {
    const pubgGame = gamesData['pubg-mobile'];
    const efootballGame = gamesData['efootball-mobile'];
    
    expect(getMaxPlayerCount(pubgGame)).toBe(3); // 4 total - 1 captain
    expect(getMaxPlayerCount(efootballGame)).toBe(0); // Individual
  });

  test('getMaxSubstitutes should work correctly', () => {
    const pubgGame = gamesData['pubg-mobile'];
    const chessGame = gamesData['chess'];
    
    expect(getMaxSubstitutes(pubgGame)).toBe(2);
    expect(getMaxSubstitutes(chessGame)).toBe(0);
  });

  test('isGameIndividual should work correctly', () => {
    const efootballGame = gamesData['efootball-mobile'];
    const pubgGame = gamesData['pubg-mobile'];
    
    expect(isGameIndividual(efootballGame)).toBe(true);
    expect(isGameIndividual(pubgGame)).toBe(false);
  });

  test('getGameSpecificRequiredFields should work correctly', () => {
    const pubgGame = gamesData['pubg-mobile'];
    const freeFireGame = gamesData['free-fire'];
    
    const pubgFields = getGameSpecificRequiredFields(pubgGame);
    const freeFireFields = getGameSpecificRequiredFields(freeFireGame);
    
    expect(pubgFields).toContain('in_game_id');
    expect(pubgFields).toContain('preferred_server');
    expect(freeFireFields).toHaveLength(0);
  });

  test('validateStudentIdFormat should work correctly', () => {
    expect(validateStudentIdFormat('STU123456')).toBe(true);
    expect(validateStudentIdFormat('stu123456')).toBe(true);
    expect(validateStudentIdFormat('STU123')).toBe(false); // Too short
    expect(validateStudentIdFormat('STU123456789012345678901')).toBe(false); // Too long
    expect(validateStudentIdFormat('STU123!@#')).toBe(false); // Invalid characters
    expect(validateStudentIdFormat('')).toBe(false);
    expect(validateStudentIdFormat('   ')).toBe(false);
  });

  test('validateTeamName should work correctly', () => {
    const teamGame = gamesData['pubg-mobile'];
    const individualGame = gamesData['efootball-mobile'];
    
    expect(validateTeamName('Team Alpha', teamGame)).toBe(true);
    expect(validateTeamName('A', teamGame)).toBe(false); // Too short
    expect(validateTeamName('', teamGame)).toBe(false); // Empty
    expect(validateTeamName('   ', teamGame)).toBe(false); // Whitespace
    expect(validateTeamName('My Team', individualGame)).toBe(false); // Should be empty for individual
    expect(validateTeamName('', individualGame)).toBe(true); // Empty is fine for individual
  });

  test('checkDuplicatePlayerIds should work correctly', () => {
    const playersWithDuplicates = [
      { name: 'Player 1', studentId: 'STU001', university: 'Uni 1' },
      { name: 'Player 2', studentId: 'STU002', university: 'Uni 2' },
      { name: 'Player 3', studentId: 'STU001', university: 'Uni 3' }, // Duplicate
    ];
    
    const substitutesWithDuplicates = [
      { name: 'Sub 1', studentId: 'SUB001', university: 'Uni 1' },
      { name: 'Sub 2', studentId: 'STU001', university: 'Uni 2' }, // Duplicate with player
    ];
    
    const noDuplicates = checkDuplicatePlayerIds(playersWithDuplicates.slice(0, 2));
    const withDuplicates = checkDuplicatePlayerIds(playersWithDuplicates);
    const withSubDuplicates = checkDuplicatePlayerIds(playersWithDuplicates, substitutesWithDuplicates);
    
    expect(noDuplicates).toHaveLength(0);
    expect(withDuplicates).toContain('STU001');
    expect(withSubDuplicates).toContain('STU001');
  });

  test('should handle edge cases and invalid inputs', () => {
    // Test with null/undefined inputs
    expect(validatePlayerInfo(null)).toBe(false);
    expect(validatePlayerInfo(undefined)).toBe(false);
    expect(validateTeamData(null)).toBe(false);
    expect(validateTournamentPayload(null)).toBe(false);
    
    // Test with empty strings
    expect(validateStudentIdFormat('')).toBe(false);
    expect(validateTeamName('', gamesData['pubg-mobile'])).toBe(false);
    
    // Test with whitespace-only strings
    expect(validateStudentIdFormat('   ')).toBe(false);
    expect(validateTeamName('   ', gamesData['pubg-mobile'])).toBe(false);
  });

  test('should validate different game types correctly', () => {
    // Test duo games
    const eaFcGame = gamesData['ea-fc-2v2'];
    const duoSchema = createTournamentRegistrationSchema(eaFcGame);
    
    const validDuoData = {
      tournamentId: 'tournament-123',
      teamName: 'Duo Squad',
      players: [teamPlayers[0]], // 1 player (2 total - 1 captain)
      substitutes: [],
      gameSpecificFields: { platform: 'PlayStation 5', ea_account: 'ea_user123' },
    };
    
    expect(duoSchema.safeParse(validDuoData).success).toBe(true);
    
    // Test with too many players for duo (max 1 teammate + captain = 2 total)
    const tooManyPlayers = {
      tournamentId: 'tournament-123',
      teamName: 'Duo Squad',
      players: teamPlayers.slice(0, 2), // 2 players (3 total - 1 captain) - too many
      substitutes: [],
      gameSpecificFields: { platform: 'PlayStation 5', ea_account: 'ea_user123' },
    };
    
    expect(duoSchema.safeParse(tooManyPlayers).success).toBe(false);
  });
});

describe('Schema integration tests', () => {
  test('should handle complete tournament registration flow', () => {
    const pubgGame = gamesData['pubg-mobile'];
    const schema = createTournamentRegistrationSchema(pubgGame);
    
    const completeRegistration = {
      tournamentId: 'tournament-pubg-123',
      teamName: 'Elite Squad',
      additionalInfo: 'Ready for competition',
      players: [
        { name: 'Player 2', studentId: 'STU002', university: 'Uni A', inGameId: 'player2' },
        { name: 'Player 3', studentId: 'STU003', university: 'Uni B', inGameId: 'player3' },
        { name: 'Player 4', studentId: 'STU004', university: 'Uni C', inGameId: 'player4' },
      ],
      substitutes: [
        { name: 'Sub 1', studentId: 'SUB001', university: 'Uni D', inGameId: 'sub1' },
      ],
      gameSpecificFields: { in_game_id: 'CAPTAIN123', preferred_server: 'Asia' },
    };
    
    const result = schema.safeParse(completeRegistration);
    expect(result.success).toBe(true);
  });
  
  test('should fail validation with missing required fields', () => {
    const pubgGame = gamesData['pubg-mobile'];
    const schema = createTournamentRegistrationSchema(pubgGame);
    
    const incompleteRegistration = {
      tournamentId: 'tournament-pubg-123',
      teamName: '',
      players: [
        { name: '', studentId: '', university: '' }, // Invalid player
      ],
      substitutes: [],
      gameSpecificFields: {},
    };
    
    const result = schema.safeParse(incompleteRegistration);
    expect(result.success).toBe(false);
    if (!result.success) {
      // Should have multiple validation errors
      expect(result.error.issues.length).toBeGreaterThan(1);
    }
  });
});