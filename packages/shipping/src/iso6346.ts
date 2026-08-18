/**
 * ISO 6346 — the standard that gives every shipping container its identity.
 *
 * A container number is eleven characters: a three-letter owner code, one category
 * identifier, a six-digit serial, and a check digit computed from the other ten. The
 * check digit is the part worth having in code: it catches the transposed digits and
 * misread letters that a plain length-and-pattern check waves through, and a container
 * number is copied by hand off a steel door often enough that this matters.
 *
 * Shared because the API must validate it and the form should not make an operator wait
 * for a round trip to learn they mistyped. Unlike a max-length constant, an algorithm
 * duplicated by hand is an algorithm that will eventually disagree with itself.
 */

/**
 * Letter values per ISO 6346: A is 10, and every multiple of 11 is skipped — so K is 21,
 * L is 23, U is 32, V is 34. Built rather than written out, because a transcribed table
 * is exactly the kind of thing that acquires a typo.
 */
const LETTER_VALUES: Record<string, number> = (() => {
  const values: Record<string, number> = {};
  let value = 10;

  for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    if (value % 11 === 0) value += 1;
    values[letter] = value;
    value += 1;
  }

  return values;
})();

/**
 * The category identifier — the fourth letter.
 *
 * `U` is a freight container, `J` detachable equipment belonging to one, `Z` a trailer or
 * chassis. In practice everything on a yard is a `U`, but the standard allows all three
 * and rejecting the others would refuse a legitimate number.
 */
export const CONTAINER_CATEGORIES = ["U", "J", "Z"] as const;

/** Owner code, category, serial — the shape, without the check digit. */
export const CONTAINER_NUMBER_PREFIX_PATTERN = /^[A-Z]{3}[UJZ][0-9]{6}$/;

/** The whole thing, check digit included. Shape only — see `isValidContainerNumber`. */
export const CONTAINER_NUMBER_PATTERN = /^[A-Z]{3}[UJZ][0-9]{6}[0-9]$/;

export const CONTAINER_NUMBER_LENGTH = 11;

/**
 * Strips the spaces and dashes a container number is usually written with, and uppercases
 * it. `MSCU 123456-5` and `mscu1234565` are the same container, and the database should
 * only ever hold one spelling of it.
 */
export function normalizeContainerNumber(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

/**
 * The check digit for the first ten characters, or `null` if they are not a valid prefix.
 *
 * Each character's value is weighted by 2^position, summed, and taken mod 11; a remainder
 * of 10 is written as 0. That last case is the one hand-rolled implementations get wrong.
 */
export function computeCheckDigit(prefix: string): number | null {
  const normalized = normalizeContainerNumber(prefix);
  if (!CONTAINER_NUMBER_PREFIX_PATTERN.test(normalized)) return null;

  let sum = 0;

  for (let index = 0; index < 10; index += 1) {
    const character = normalized[index]!;
    const value = LETTER_VALUES[character] ?? Number(character);
    sum += value * 2 ** index;
  }

  return (sum % 11) % 10;
}

/** Whether a container number is well-formed *and* its check digit agrees. */
export function isValidContainerNumber(value: string): boolean {
  const normalized = normalizeContainerNumber(value);
  if (!CONTAINER_NUMBER_PATTERN.test(normalized)) return false;

  const expected = computeCheckDigit(normalized.slice(0, 10));
  return expected !== null && expected === Number(normalized[10]);
}

/**
 * Completes a prefix into a full container number — what a form's "check" affordance and
 * the seed both need, so neither has to hard-code a digit that could be wrong.
 */
export function toContainerNumber(prefix: string): string | null {
  const normalized = normalizeContainerNumber(prefix);
  const checkDigit = computeCheckDigit(normalized);
  return checkDigit === null ? null : `${normalized}${checkDigit}`;
}

/**
 * The owner code — the first three letters, registered with the BIC.
 *
 * Worth exposing because it identifies the leasing company or line that owns the box,
 * which is *not* the same thing as the console account responsible for it.
 */
export function ownerCodeOf(containerNumber: string): string | null {
  const normalized = normalizeContainerNumber(containerNumber);
  return CONTAINER_NUMBER_PATTERN.test(normalized) ? normalized.slice(0, 3) : null;
}
