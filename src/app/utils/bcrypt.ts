import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const SALT_ROUNDS = 12;

export const bcryptUtils = {
  hashPassword: async (password: string): Promise<string> => {
    return await bcrypt.hash(password, SALT_ROUNDS);
  },

  comparePassword: async (password: string, hash: string): Promise<boolean> => {
    if (!password || !hash) return false;

    // Backward compatibility for existing scrypt hashes from legacy JSON store
    if (hash.startsWith('scrypt$')) {
      try {
        const parts = hash.split('$');
        if (parts.length === 3) {
          const salt = parts[1];
          const expectedHash = parts[2];
          const actualHash = crypto.scryptSync(password, salt, 64).toString('hex');
          return actualHash === expectedHash;
        }
      } catch {
        return false;
      }
    }

    return await bcrypt.compare(password, hash);
  },
};
