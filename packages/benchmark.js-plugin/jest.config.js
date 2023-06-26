const esmModules = [
  "find-up",
  "locate-path",
  "p-locate",
  "p-limit",
  "yocto-queue",
  "path-exists",
  "stack-trace",
];

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": ["ts-jest"],
    // transform js with babel-jest
    "^.+\\.js$": "babel-jest",
  },
  testPathIgnorePatterns: [
    "/node_modules/",
    "<rootDir>/tests/",
    "<rootDir>/.rollup.cache/",
  ],
  transformIgnorePatterns: [
    `node_modules/(?!(?:.pnpm/)?(${esmModules.join("|")}))`,
  ],
};
