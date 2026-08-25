import { tmpdir } from 'os';
import { join } from 'path';
import { TEST_DATABASE_URL } from './database-url';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.DIRECT_URL = TEST_DATABASE_URL;
// Uploaded CVs land in a throwaway directory per run, so a suite never reads a file
// an earlier one left behind.
process.env.STORAGE_PROVIDER = 'fs';
process.env.STORAGE_FS_ROOT = join(tmpdir(), `devscribed-cv-${process.pid}`);
