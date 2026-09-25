# mujun

設計書（Markdown + Mermaid）の矛盾を見つける Linter。eslint のように、どのプロジェクトからも `npx mujun` で使えることを目指す。

## 方針

- 汎用ルールは、どのプロジェクトでも誤検知しにくいものだけにする。プロジェクト固有の検査は、そのプロジェクトの側で `defineRule` を使って書く
- ルールには必ず `invalid`（壊れた例）を持たせる。`pnpm selftest` で、全ルールが自分の例で落ちることを確かめる
- 検査の前提（FK の別名など）は、設定ファイルより設計書の表に書かせる
- 変更したら `pnpm check`（型・ESLint・Prettier・テスト・selftest）を通す

## 構成

- `src/markdown.ts`：Markdown を Doc に読む（mdast。表のセルは元の文字列のまま持つ）
- `src/er.ts`：erDiagram を自前で解析する（Mermaid の公式パーサーは DOM が要るため使わない）
- `src/engine.ts`：Project を組み立て、ルールを走らせる
- `src/config.ts`：`mujun.config.ts` を探して読む
- `src/selftest.ts`：各ルールの `invalid` / `valid` を走らせる
- `src/rules/`：組み込みルール。`recommended.ts` が既定のセット

Node は `node_modules` の中の `.ts` を読めない。そのため npm に出すときは `pnpm build` で `dist/` に出力する。開発中は `src/*.ts` をそのまま実行する。
