export { defineConfig, defineRule } from "./define.ts";
export { buildProject, runRules } from "./engine.ts";
export { findTables, ticks } from "./markdown.ts";
export { default as recommended } from "./rules/recommended.ts";
export { selftest, type SelftestProject, type SelftestResult } from "./selftest.ts";
export type * from "./types.ts";
