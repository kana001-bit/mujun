// 守る仕様: VS Code 拡張が、プロジェクトの mujun を見つけて走らせ、--format json を読み違えずに指摘をファイルごとに分ける
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { findCli, groupByFile, type MujunResult, parseOutput, runMujun } from "../src/run.ts";

// テストは out/test/ にビルドされてから走る。mujun 本体の CLI は、リポジトリの src/cli.ts を Node 24 でそのまま使う
const repoCli = join(__dirname, "..", "..", "..", "src", "cli.ts");
const dir = realpathSync(mkdtempSync(join(tmpdir(), "mujun-vscode-")));
after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("CLI は、設定のディレクトリから上に向かって node_modules/mujun を探す（モノレポの下の階層に設定があってもよい）", () => {
  const cli = join(dir, "node_modules", "mujun", "dist", "cli.js");
  mkdirSync(join(dir, "node_modules", "mujun", "dist"), { recursive: true });
  writeFileSync(cli, "");
  mkdirSync(join(dir, "packages", "docs"), { recursive: true });
  assert.equal(findCli(join(dir, "packages", "docs")), cli);
  // どこにも無ければ undefined（拡張は「npm i -D mujun」を案内する）
  assert.equal(findCli(tmpdir()), undefined);
});

test("出力は version 1 だけを読み、知らない version や JSON でないものは理由を書いて投げる", () => {
  const ok = { version: 1, root: "/p", files: ["a.md"], problems: [] };
  assert.deepEqual(parseOutput(JSON.stringify(ok)), { root: "/p", files: ["a.md"], problems: [] });
  // 形が変わった CLI の出力を、黙って読み違えない
  assert.throws(() => parseOutput(JSON.stringify({ ...ok, version: 2 })), /version 2/);
  assert.throws(() => parseOutput("mujun: ok — 3 files"), /JSON ではない/);
  assert.throws(
    () => parseOutput(JSON.stringify({ ...ok, problems: [{ ruleId: "x", severity: "info" }] })),
    /problems/,
  );
});

test("指摘はファイルの絶対パスごとに分け、指摘の無い検査済みファイルは空にし、path の無い指摘は設定ファイルに付け、行は 0 始まりにする", () => {
  const result: MujunResult = {
    root: dir,
    files: ["docs/a.md", "docs/b.md"],
    problems: [
      { ruleId: "list/numbering", severity: "error", message: "番号", path: "docs/a.md", line: 5 },
      { ruleId: "count/declared", severity: "warn", message: "宣言が無い" },
    ],
  };
  const config = join(dir, "mujun.config.mjs");
  const byFile = groupByFile(result, config);
  assert.deepEqual(
    [...byFile],
    [
      [
        join(dir, "docs", "a.md"),
        [{ line: 4, severity: "error", message: "番号", ruleId: "list/numbering" }],
      ],
      // 空の配列で入れるので、前回出ていた指摘が消える
      [join(dir, "docs", "b.md"), []],
      [config, [{ line: 0, severity: "warn", message: "宣言が無い", ruleId: "count/declared" }]],
    ],
  );
});

test("CLI を走らせ、error の指摘があっても（終了コード 1）結果として読み、設定が読めないとき（終了コード 2）は理由を返す", async () => {
  mkdirSync(join(dir, "proj", "docs"), { recursive: true });
  writeFileSync(join(dir, "proj", "docs", "a.md"), "1. 一\n3. 三\n");
  const config = join(dir, "proj", "mujun.config.mjs");
  writeFileSync(
    config,
    `export default { files: ["docs/*.md"], rules: { "list/numbering": "error" } };\n`,
  );
  const ok = await runMujun({ node: process.execPath, cli: repoCli, config });
  assert.ok(ok.ok, ok.ok ? "" : ok.message);
  assert.deepEqual(
    ok.result.problems.map((p) => [p.ruleId, p.path, p.line]),
    [["list/numbering", "docs/a.md", 2]],
  );

  const broken = join(dir, "proj", "broken.config.mjs");
  writeFileSync(broken, `throw new Error("設定が壊れている");\n`);
  const ng = await runMujun({ node: process.execPath, cli: repoCli, config: broken });
  if (ng.ok) assert.fail("設定が読めないのに結果として返した");
  assert.match(ng.message, /設定が壊れている/);
});

test("--format を知らない古い mujun（0.1.0）なら、更新を案内する", async () => {
  // 0.1.0 の CLI と同じく、知らないオプションで parseArgs が投げる
  const oldCli = join(dir, "old-cli.mjs");
  writeFileSync(
    oldCli,
    `import { parseArgs } from "node:util";\nparseArgs({ options: { config: { type: "string" } } });\n`,
  );
  const r = await runMujun({ node: process.execPath, cli: oldCli, config: join(dir, "x.mjs") });
  if (r.ok) assert.fail("古い mujun なのに結果として返した");
  assert.match(r.message, /0\.2\.0 以上/);
});

test("時間内に終わらなければ打ち切り、何秒で打ち切ったかを返す", async () => {
  const slowCli = join(dir, "slow-cli.mjs");
  writeFileSync(slowCli, "setTimeout(() => {}, 60_000);\n");
  const r = await runMujun({
    node: process.execPath,
    cli: slowCli,
    config: join(dir, "x.mjs"),
    timeout: 300,
  });
  if (r.ok) assert.fail("打ち切ったのに結果として返した");
  assert.match(r.message, /0\.3 秒で終わらず/);
});
