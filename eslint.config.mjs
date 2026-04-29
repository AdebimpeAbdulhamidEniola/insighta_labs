import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Allow console.log in backend (needed for morgan/logging)
      "no-console": "off",

      // Warn on unused variables but don't fail the build for _ prefixed ones
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],

      // Allow explicit any in some cases — warn not error
      "@typescript-eslint/no-explicit-any": "warn",
    },
    ignores: ["dist/**", "node_modules/**"],
  }
);

