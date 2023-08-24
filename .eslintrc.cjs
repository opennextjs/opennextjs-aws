module.exports = {
  extends: ["@sladg/eslint-config-base/node"],
  ignorePatterns: [
    "**/node_modules/**",
    "**/dist/**",
    "**/pnpm-lock.yaml",
    "packages/open-next/assets/sharp-node-modules",
  ],
  rules: {
    "prettier/prettier": [
      "error",
      {
        // This resets rules to prettier's defaults
      },
    ],
    "sonarjs/elseif-without-else": "warn",
    "sonarjs/no-duplicate-string": "warn",
    "sonarjs/cognitive-complexity": "warn",
  },
};
