/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.test.json",
      },
    ],
  },
  testPathIgnorePatterns: [
    "/node_modules/",
    "<rootDir>/tests/",
    "<rootDir>/.rollup.cache/",
  ],
};
