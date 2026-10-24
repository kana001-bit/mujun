// 守る仕様: CLI の --format json の形と終了コード（エディタ拡張など、利用者のツールが読む）
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const cli = join(import.meta.dirname, "..", "src", "cli.ts");
// Windows の一時ディレクトリは短い名前（KANNN~1）で返ることがあるので、実際のパスに直して比べる
const dir = realpathSync(mkdtempSync(join(tmpdir(), "mujun-cli-")));
after(() => {
  rmSync(dir, { recursive: true, force: true });
});

// 設定は mujun を import しない .mjs にする（一時ディレクトリからは mujun を解決できないため）
const config = (name: string, severity: string): string => {
  const path = join(dir, name);
  writeFileSync(
    path,
    `export default { files: ["docs/*.md"], rules: { "list/numbering": "${severity}" } };\n`,
  );
  return path;
};
mkdirSync(join(dir, "docs"));
writeFileSync(join(dir, "docs", "a.md"), "# A\n\n1. 一\n2. 二\n4. 四\n");
writeFileSync(join(dir, "docs", "b.md"), "# B\n");

const run = (...args: string[]): { status: number; json: unknown } => {
  try {
    const stdout = execFileSync(process.execPath, [cli, ...args], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, json: JSON.parse(stdout) };
  } catch (e) {
    const { status, stdout } = e as { status: number; stdout: string };
    return { status, json: JSON.parse(stdout) };
  }
};

test("CLI: --format json は、設定のディレクトリ・検査したファイル・指摘を 1 つの JSON で標準出力に出し、error があれば終了コード 1", () => {
  config("error.config.mjs", "error");
  // --config を相対で渡しても、root は絶対パスで返す（拡張は CLI と違うディレクトリにいる）
  const { status, json } = run("--config", "error.config.mjs", "--format", "json");
  assert.equal(status, 1);
  assert.deepEqual(json, {
    version: 1,
    root: dir,
    // path は root からの相対で / 区切り。拡張はこれを root に足して開く
    files: ["docs/a.md", "docs/b.md"],
    problems: [
      {
        ruleId: "list/numbering",
        severity: "error",
        message: "番号が 1・2・4（期待 1・2・3）",
        path: "docs/a.md",
        // 食い違いが見えた行（4. の行）を指す
        line: 5,
      },
    ],
  });
});

test("CLI: --format json に --quiet を付けると warn を出さず、warn だけなら終了コード 0", () => {
  const { status, json } = run(
    "--config",
    config("warn.config.mjs", "warn"),
    "--format",
    "json",
    "--quiet",
  );
  assert.equal(status, 0);
  assert.deepEqual((json as { problems: unknown[] }).problems, []);
});

test("CLI: 設定ファイルが読めないときは、error の指摘あり（1）と見分けられるよう終了コード 2 で、理由を標準エラーに出す", () => {
  writeFileSync(join(dir, "broken.config.mjs"), `throw new Error("設定が壊れている");\n`);
  const r = spawnSync(
    process.execPath,
    [cli, "--config", "broken.config.mjs", "--format", "json"],
    {
      cwd: dir,
      encoding: "utf8",
    },
  );
  assert.equal(r.status, 2);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /設定が壊れている/);
});

test("CLI: 引数が読めないとき（値不足・知らないオプション・知らない --format・selftest の --format json）も終了コード 2", () => {
  const cfg = config("args.config.mjs", "error");
  for (const args of [
    ["--format"],
    ["--config"],
    ["--formt", "json"],
    ["--format", "xml"],
    ["selftest", "--format", "json"],
  ]) {
    const r = spawnSync(process.execPath, [cli, "--config", cfg, ...args], {
      cwd: dir,
      encoding: "utf8",
    });
    assert.equal(r.status, 2, args.join(" "));
    // JSON を待つ側が、テキストを JSON として読み違えないよう、標準出力には何も出さない
    assert.equal(r.stdout, "", args.join(" "));
    assert.match(r.stderr, /mujun:/, args.join(" "));
  }
});
