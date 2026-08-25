import { mkdtemp, readFile, readdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalFsStorage } from '../src/hiring/storage/local-fs.storage';
import { StorageConfigError, resolveStorageConfig } from '../src/hiring/storage/storage.config';

/**
 * The one configuration this application refuses to run in, and the one property its
 * storage keys must have. Both are cheap to get wrong and expensive to discover in
 * production: a discarded CV cannot be recovered from anywhere.
 */
describe('Hiring — storage', () => {
  /** TC-H00-INT-01 */
  describe('resolveStorageConfig', () => {
    it('refuses production with filesystem storage, naming the variable', () => {
      expect(() =>
        resolveStorageConfig({ NODE_ENV: 'production', STORAGE_PROVIDER: 'fs' } as NodeJS.ProcessEnv),
      ).toThrow(StorageConfigError);

      try {
        resolveStorageConfig({ NODE_ENV: 'production', STORAGE_PROVIDER: 'fs' } as NodeJS.ProcessEnv);
      } catch (error) {
        expect((error as Error).message).toContain('STORAGE_PROVIDER');
      }
    });

    it('accepts filesystem storage outside production', () => {
      expect(
        resolveStorageConfig({
          NODE_ENV: 'development',
          STORAGE_PROVIDER: 'fs',
          STORAGE_FS_ROOT: '/tmp/cv',
        } as NodeJS.ProcessEnv),
      ).toEqual({ provider: 'fs', root: '/tmp/cv' });
    });

    it('refuses a provider it has no implementation for', () => {
      expect(() => resolveStorageConfig({ STORAGE_PROVIDER: 's3' } as NodeJS.ProcessEnv)).toThrow(
        StorageConfigError,
      );
      expect(() =>
        resolveStorageConfig({ STORAGE_PROVIDER: 'gcs' } as NodeJS.ProcessEnv),
      ).toThrow(StorageConfigError);
    });
  });

  /** TC-H00-UNIT-03 */
  describe('LocalFsStorage keys', () => {
    let root: string;
    let storage: LocalFsStorage;

    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), 'devscribed-storage-'));
      storage = new LocalFsStorage(root);
    });

    it('writes nothing outside the configured root', async () => {
      await storage.put('../../etc/passwd', Buffer.from('nope'), 'text/plain');

      const written = await readdir(root);
      expect(written).toContain('.._.._etc_passwd');
      // The traversal did not survive the substitution, so nothing escaped.
      expect(await readFile(join(root, '.._.._etc_passwd'), 'utf8')).toBe('nope');
    });

    it('replaces disallowed characters and still reads the same bytes back', async () => {
      const bytes = Buffer.from('a cv');

      await storage.put('a b/c.pdf', bytes, 'application/pdf');
      const read = await storage.get('a b/c.pdf');

      expect(read?.bytes.equals(bytes)).toBe(true);
      expect(read?.contentType).toBe('application/pdf');
    });

    it('answers null for a key it never stored', async () => {
      expect(await storage.get('missing.pdf')).toBeNull();
    });

    it('removes both the file and its recorded content type', async () => {
      await storage.put('gone.pdf', Buffer.from('x'), 'application/pdf');

      await storage.delete('gone.pdf');

      expect(await storage.get('gone.pdf')).toBeNull();
      expect(await readdir(root)).toEqual([]);
    });
  });
});
