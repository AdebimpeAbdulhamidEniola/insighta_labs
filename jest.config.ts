import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  // Look for test files in __tests__ folders or *.test.ts files
  testMatch: ["**/__tests__/**/*.ts", "**/*.test.ts"],
  // Don't try to test compiled output
  modulePathIgnorePatterns: ["dist"],
};

export default config;