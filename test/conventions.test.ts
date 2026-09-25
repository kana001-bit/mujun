// 守る仕様: AGENTS.md「テストの約束」。どのテストファイルも、先頭行に守る仕様を書く
import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

test("テストファイルは全部、先頭行が「// 守る仕様: 〜」で始まる", () => {
  const files = globSync("**/*.test.ts", { cwd: import.meta.dirname });
  // glob が何も拾わなくなったら、このテストは何も言わずに通り続けてしまう
  assert.ok(files.includes("conventions.test.ts"));
  const missing = files.filter((f) => {
    const first = readFileSync(join(import.meta.dirname, f), "utf8").split("\n")[0] ?? "";
    return !/^\/\/ 守る仕様: \S/.test(first);
  });
  assert.deepEqual(missing, [], "先頭行に「// 守る仕様: 〜」が無い");
});
