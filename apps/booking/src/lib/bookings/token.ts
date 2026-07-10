import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

/** A URL-safe, unguessable per-booking token for Manage/Reschedule links. */
export function generateBookingToken(): string {
  return randomBytes(32).toString("base64url");
}

/** An internal booking id. */
export function generateBookingId(): string {
  return randomUUID();
}
