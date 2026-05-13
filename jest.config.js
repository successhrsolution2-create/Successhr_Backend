module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFilesAfterEnv: ['./tests/setup.js'],
  coverageThreshold: {
    global: {
      lines: 80,
      functions: 80,
      branches: 70
    }
  }
}
