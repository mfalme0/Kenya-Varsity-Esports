import { describe, expect, test } from 'bun:test';
import { normalizeStudentId, validateStudentId } from '../studentId';

describe('validateStudentId', () => {
  test('accepts common Kenyan institution ID formats', () => {
    const ids = [
      'EMME/02052/2021',
      '25/10176',
      'I122/5834/2024',
      'CT201/111973/23',
      'I162/0859/2025',
      'CIT-221-014/2024',
      'HSM222-0287',
      'bobit198327',
      '12345678',
    ];

    for (const id of ids) {
      expect(validateStudentId(id).valid).toBe(true);
    }
  });

  test('rejects empty and whitespace-only IDs', () => {
    expect(validateStudentId('').valid).toBe(false);
    expect(validateStudentId('   ').valid).toBe(false);
    expect(validateStudentId(null).valid).toBe(false);
  });

  test('rejects IDs that are too short or too long', () => {
    expect(validateStudentId('123').valid).toBe(false);
    expect(validateStudentId('A'.repeat(31)).valid).toBe(false);
  });

  test('rejects IDs without a number', () => {
    expect(validateStudentId('Shadrack').valid).toBe(false);
    expect(validateStudentId('kinap').valid).toBe(false);
  });

  test('rejects unsupported characters', () => {
    expect(validateStudentId('STU123!@#').valid).toBe(false);
    expect(validateStudentId('STU 123;DROP').valid).toBe(false);
  });

  test('normalizes for duplicate detection', () => {
    expect(normalizeStudentId(' emme/02052/2021 ')).toBe('EMME/02052/2021');
    expect(normalizeStudentId('25 / 10176')).toBe('25/10176');
    expect(normalizeStudentId(null)).toBe('');
  });
});
