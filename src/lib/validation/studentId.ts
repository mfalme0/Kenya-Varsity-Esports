/**
 * Student ID validation shared by the registration form and the registration API.
 *
 * There is no central student registry to verify against, so "valid" means the
 * ID looks like a real institution-issued ID and is unique across profiles.
 * Kenyan institution IDs commonly use slashes, dashes and underscores
 * (e.g. "EMME/02052/2021", "25/10176", "CT201/111973/23"), so those must be
 * accepted rather than rejected by an alphanumeric-only rule.
 */

export const STUDENT_ID_MIN_LENGTH = 4;
export const STUDENT_ID_MAX_LENGTH = 30;

// Letters, numbers and the separators used by Kenyan institution IDs.
const STUDENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9./_ -]*$/;

export interface StudentIdValidationResult {
  valid: boolean;
  normalized: string;
  error?: string;
}

/** Case-insensitive comparison key used to detect duplicate IDs. */
export function normalizeStudentId(value: string | null | undefined): string {
  return (value || '').trim().replace(/\s+/g, '').toUpperCase();
}

export function validateStudentId(
  value: string | null | undefined
): StudentIdValidationResult {
  const trimmed = (value || '').trim();
  const normalized = normalizeStudentId(trimmed);

  if (!trimmed) {
    return {
      valid: false,
      normalized,
      error: 'Student ID is required for participant registration.',
    };
  }

  if (trimmed.length < STUDENT_ID_MIN_LENGTH) {
    return {
      valid: false,
      normalized,
      error: `Student ID must be at least ${STUDENT_ID_MIN_LENGTH} characters.`,
    };
  }

  if (trimmed.length > STUDENT_ID_MAX_LENGTH) {
    return {
      valid: false,
      normalized,
      error: `Student ID must be at most ${STUDENT_ID_MAX_LENGTH} characters.`,
    };
  }

  if (!STUDENT_ID_PATTERN.test(trimmed)) {
    return {
      valid: false,
      normalized,
      error: 'Student ID can only contain letters, numbers, spaces, dots, slashes, dashes and underscores.',
    };
  }

  if (!/\d/.test(trimmed)) {
    return {
      valid: false,
      normalized,
      error: 'Student ID must contain at least one number.',
    };
  }

  return { valid: true, normalized };
}
