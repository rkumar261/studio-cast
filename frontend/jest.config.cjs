const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

/** @type {import('jest').Config} */
const customJestConfig = {
  roots: ['<rootDir>/__test__'],
  testEnvironment: 'jsdom',
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  collectCoverageFrom: [
    'src/lib/download.ts',
    'src/lib/recording-journey.ts',
    'src/lib/studio/access.ts',
    'src/lib/studio/queue-logic.ts',
    'src/lib/studio/recorder-seq.ts',
    'src/lib/studio/roomId.ts',
  ],
  coveragePathIgnorePatterns: ['/node_modules/', '/.next/'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

module.exports = createJestConfig(customJestConfig);
