/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  testEnvironment: 'node',
  /*
   * One database, one suite at a time.
   *
   * Every hiring suite's `beforeEach` truncates the whole schema, so two spec files
   * running concurrently delete each other's fixtures mid-test — which surfaces as a
   * session that was valid a line earlier answering 401, or a vacancy that vanished
   * between being created and being booked against. The `test` script passes `--runInBand`;
   * this is here so that running `npx jest` directly cannot reintroduce it, because serial
   * execution is a property of the suite rather than of the command somebody happened to type.
   *
   * The script also passes `--forceExit`. A suite that finishes its tests and then never
   * returns is indistinguishable from a suite still running, and whoever is waiting — a person
   * or an agent — waits forever on a result that already exists. Forcing the exit turns that
   * into a completed run with a verdict. It does not close the handle that kept the process
   * alive; `--detectOpenHandles` on the suite that hangs is how that one is found.
   */
  maxWorkers: 1,
  globalSetup: '<rootDir>/test/global-setup.ts',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  testTimeout: 30000,
};
