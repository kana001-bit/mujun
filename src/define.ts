import type { Config, Rule } from "./types.ts";

// 型を付けるためだけの恒等関数。eslint の defineConfig と同じ役目
export const defineRule = <Options>(rule: Rule<Options>): Rule<Options> => rule;
export const defineConfig = (config: Config): Config => config;
