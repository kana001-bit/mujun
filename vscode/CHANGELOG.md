# Changelog

## 0.1.0

最初の版です。

- 設計書（Markdown）と `mujun.config.*` を保存したとき、ワークスペースを開いたとき、Explorer でファイルを削除・改名したときに、プロジェクトの mujun を走らせ、指摘を「問題」パネルと波線に出す
- mujun は同梱せず、プロジェクトの `node_modules/mujun`（0.2.0 以上）を、`mujun.nodePath`（既定は PATH の `node`）で走らせる。CLI や CI と同じ版・同じ結果になる
- 走らせられなかったときは、ステータスバーに `⚠ mujun` を出し、理由を「出力」パネルに書く
- 信頼したワークスペースでだけ動く
