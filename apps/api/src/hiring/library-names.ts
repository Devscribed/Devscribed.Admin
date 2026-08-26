import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { validateLibraryName } from '@devscribed/validation';
import { Prisma } from '@prisma/client';

export interface LibraryRow {
  id: string;
  name: string;
}

/** The name as it will be stored, or a 422 against the field the member typed into. */
export function validLibraryName(input: unknown): string {
  const result = validateLibraryName(typeof input === 'string' ? input : '');
  if (!result.valid) {
    throw new UnprocessableEntityException({
      error: 'validation',
      fields: { name: result.error },
    });
  }
  return result.value;
}

/**
 * The uniqueness half of both org-wide libraries (hiring 06 §01), which is otherwise the
 * same forty lines written twice.
 *
 * Categories and criteria share every rule about a name — trimmed, 1–50 characters,
 * unique per organization case-insensitively — and share the way that rule is
 * guaranteed: a `lower(name)` unique index, with a lookup in front of it so a duplicate
 * can be answered with the **existing row's id** rather than a bare refusal. What they
 * do not share is the table, so the lookup arrives as a closure and nothing here names a
 * Prisma delegate.
 */
export class LibraryNames {
  constructor(
    private readonly lookup: (name: string, excludeId?: string) => Promise<LibraryRow | null>,
  ) {}

  /**
   * Refuses a name the library already holds, in whatever case.
   *
   * 409 rather than a silent no-op, but the body carries the existing row so an inline
   * caller can select it instead of surfacing an error the member cannot act on — they
   * typed `react`, they meant `React`, and it is right there (06 §01.3).
   *
   * `excludeId` is what lets a rename keep its own name.
   */
  async refuseDuplicate(
    name: string,
    message: (name: string) => string,
    excludeId?: string,
  ): Promise<void> {
    const duplicate = await this.lookup(name, excludeId);
    if (duplicate) throw this.conflict(duplicate, message(name));
  }

  /**
   * The lookup above is a convenience; the unique index is the guarantee. Two concurrent
   * creates of the same name both pass the lookup and exactly one survives the write — so
   * a unique violation here means the other one won, and the caller gets the same 409,
   * carrying the row that beat it.
   */
  async recoverFromRace(
    error: unknown,
    name: string,
    message: (name: string) => string,
  ): Promise<never> {
    const collision =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
    if (!collision) throw error;

    const winner = await this.lookup(name);
    if (!winner) throw error;
    throw this.conflict(winner, message(name));
  }

  private conflict(existing: LibraryRow, message: string): ConflictException {
    return new ConflictException({ error: 'duplicate_name', message, existing });
  }
}
