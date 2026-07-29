const js = require("@eslint/js");

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "commonjs",
      globals: {
        eagle: "readonly",
        module: "readonly",
        require: "readonly",
        console: "readonly",
        process: "readonly",
        __dirname: "readonly",
        // browser globals available in an Eagle plugin window (Chromium renderer)
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        navigator: "readonly",
        HTMLElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLButtonElement: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { caughtErrorsIgnorePattern: "^_", argsIgnorePattern: "^_" }],
    },
  },
];
