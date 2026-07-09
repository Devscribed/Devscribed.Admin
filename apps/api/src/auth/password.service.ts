import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';

/**
 * One-way password hashing (spec 02, requirement 2): passwords are stored only
 * as a salted bcrypt hash. bcrypt embeds a per-hash salt, so hashing the same
 * password twice yields different digests.
 */
@Injectable()
export class PasswordService {
  private static readonly SALT_ROUNDS = 10;

  hash(plaintext: string): Promise<string> {
    return hash(plaintext, PasswordService.SALT_ROUNDS);
  }

  verify(plaintext: string, hashed: string): Promise<boolean> {
    return compare(plaintext, hashed);
  }
}
