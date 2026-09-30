import bcrypt from 'bcryptjs';

const COST = 10;

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Compared against when the email is unknown so timing does not reveal account existence. */
export const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', COST);
