// force timezone to UTC to allow tests to work regardless of local timezone
// generally used by snapshots, but can affect specific tests
process.env.TZ = 'UTC';

const grafanaJestConfig = require('./.config/jest.config');

module.exports = {
  // Jest configuration provided by Grafana scaffolding
  ...grafanaJestConfig,
  testMatch: undefined,
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec|jest))\\.[jt]sx?$',
  testPathIgnorePatterns: ['/node_modules/', '/cypress/'],
};
