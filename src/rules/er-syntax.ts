import { defineRule } from "../define.ts";

export default defineRule({
  id: "mermaid/er-syntax",
  description: "erDiagram の行が ER 図の文法として読める",
  defaultOptions: undefined,
  check({ project, report }) {
    for (const e of project.er.errors) report({ doc: e.doc, line: e.line, message: e.message });
  },
  invalid: [
    {
      name: "閉じ括弧が無い",
      files: { "a.md": "```mermaid\nerDiagram\n  USER {\n    int id PK\n```\n" },
    },
    {
      name: "属性の行が壊れている",
      files: { "a.md": "```mermaid\nerDiagram\n  USER {\n    int\n  }\n```\n" },
    },
  ],
  valid: [
    {
      name: "コメント・別名・逆向きの線",
      files: {
        "a.md": [
          "```mermaid",
          "erDiagram",
          "  %% コメント",
          '  USER["利用者"] {',
          '    int id PK "主キー"',
          "  }",
          '  ORDER }o--|| USER : "places"',
          "```",
        ].join("\n"),
      },
    },
  ],
});
