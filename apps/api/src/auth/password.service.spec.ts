import { PasswordService } from './password.service';

describe('PasswordService — TC-02-UNIT-01: Password hashing and verification', () => {
  const service = new PasswordService();

  it('produces a hash that is not the plaintext', async () => {
    const hashed = await service.hash('Passw0rd');
    expect(hashed).not.toBe('Passw0rd');
  });

  it('verifies the correct password', async () => {
    const hashed = await service.hash('Passw0rd');
    await expect(service.verify('Passw0rd', hashed)).resolves.toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hashed = await service.hash('Passw0rd');
    await expect(service.verify('wrongpass', hashed)).resolves.toBe(false);
  });

  it('uses a per-hash salt (two hashes of the same password differ)', async () => {
    const first = await service.hash('Passw0rd');
    const second = await service.hash('Passw0rd');
    expect(first).not.toBe(second);
  });
});
