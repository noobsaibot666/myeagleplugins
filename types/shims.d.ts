/**
 * @fileoverview
 * Stub for the legacy `punycode` npm module that @types/node's internal
 * `process.d.ts` type-lookups reference (`typeof import("punycode")` inside
 * its require-cache typings). The `punycode` package ships no `.d.ts`, so
 * without redirecting it here `tsc`/`checkJs` falls through to actually
 * type-checking that package's plain-JS source — which isn't valid strict
 * TS and floods unrelated plugin projects with errors that have nothing to
 * do with their own code. Wired up via `paths` in tsconfig.base.json.
 */
declare const punycodeStub: any;
export = punycodeStub;
