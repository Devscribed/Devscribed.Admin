import { config } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

let loaded = false;

/**
 * Load environment variables from the first `.env` found among the likely
 * locations. The repository standardizes on a single root `.env` (see
 * `.env.example`), but a local `apps/api/.env` is also honored. Idempotent.
 */
export function loadEnv(): void {
  if (loaded) {
    return;
  }
  const candidates = [
    resolve(process.cwd(), '.env'), // cwd is the workspace dir under npm scripts
    resolve(process.cwd(), '../../.env'), // repo root when cwd is apps/api
    resolve(__dirname, '../../../../.env'), // fallback relative to source/dist
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      config({ path });
      break;
    }
  }
  loaded = true;
}
