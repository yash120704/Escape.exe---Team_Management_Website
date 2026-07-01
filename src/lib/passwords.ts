import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

export function isBcryptHash(value: string | null | undefined) {
  return Boolean(value && /^\$2[aby]\$\d{2}\$/.test(value));
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, storedPassword: string | null | undefined) {
  if (!storedPassword) {
    return false;
  }

  if (isBcryptHash(storedPassword)) {
    return bcrypt.compare(password, storedPassword);
  }

  // Legacy fallback for old plaintext rows; callers should rehash on success.
  return password === storedPassword;
}

export function toPublicUser<T extends { password?: string | null }>(user: T) {
  const { password, ...publicUser } = user;
  return {
    ...publicUser,
    hasPassword: Boolean(password),
  };
}
