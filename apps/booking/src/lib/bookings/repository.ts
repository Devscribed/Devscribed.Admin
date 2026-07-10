import "server-only";

import type { BookingRecord } from "@/lib/bookings/types";

/**
 * Persistence boundary for bookings. The real candidate database spec is
 * forthcoming; everything downstream depends only on this interface so the
 * in-memory stub can be swapped for a real store without changes elsewhere.
 */
export interface BookingRepository {
  create(record: BookingRecord): Promise<void>;
  getByToken(token: string): Promise<BookingRecord | null>;
  update(record: BookingRecord): Promise<void>;
  delete(id: string): Promise<void>;
}

/**
 * In-memory implementation — a stub. Data lives only for the server process's
 * lifetime. Stored on globalThis so it survives dev HMR module reloads within
 * a session.
 */
class InMemoryBookingRepository implements BookingRepository {
  private readonly store: Map<string, BookingRecord>;

  constructor(store: Map<string, BookingRecord>) {
    this.store = store;
  }

  async create(record: BookingRecord): Promise<void> {
    this.store.set(record.id, record);
  }

  async getByToken(token: string): Promise<BookingRecord | null> {
    for (const record of this.store.values()) {
      if (record.token === token) return record;
    }
    return null;
  }

  async update(record: BookingRecord): Promise<void> {
    this.store.set(record.id, record);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}

const globalStore = globalThis as unknown as {
  __bookingStore?: Map<string, BookingRecord>;
};
const store = (globalStore.__bookingStore ??= new Map<string, BookingRecord>());

const repository: BookingRepository = new InMemoryBookingRepository(store);

export function getBookingRepository(): BookingRepository {
  return repository;
}
