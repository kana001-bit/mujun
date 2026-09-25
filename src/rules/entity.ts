// エンティティの定義そのものの検査: 二重定義と孤立
import { defineRule } from "../define.ts";
import type { Entity } from "../types.ts";

const MD = (body: string): string => `\`\`\`mermaid\nerDiagram\n${body}\n\`\`\`\n`;

export const duplicateEntity = defineRule({
  id: "er/duplicate-entity",
  description: "同じエンティティを属性つきで 2 か所に定義しない（片方だけ直して食い違うため）",
  defaultOptions: undefined,
  check({ project, report }) {
    const seen = new Map<string, Entity>();
    for (const d of project.er.diagrams) {
      for (const e of d.entities) {
        if (e.attrs.length === 0) continue;
        const prev = seen.get(e.name);
        if (prev === undefined) {
          seen.set(e.name, e);
          continue;
        }
        report({
          doc: d.doc,
          line: e.line,
          message: `${e.name} は ${prev.diagram.doc.path}:${prev.line} でも定義されている`,
        });
      }
    }
  },
  invalid: [
    {
      name: "2 枚の図で同じ名前を定義",
      files: {
        "a.md":
          MD("  USER {\n    int id PK\n  }") + MD("  USER {\n    int id PK\n    string name\n  }"),
      },
    },
  ],
  valid: [
    {
      name: "俯瞰図には名前だけ",
      files: { "a.md": MD("  USER {\n    int id PK\n  }") + MD("  USER") },
    },
  ],
});

export const isolatedEntity = defineRule({
  id: "er/isolated-entity",
  description: "どの線にも出てこないエンティティが無い",
  defaultOptions: { allow: [] as string[] },
  check({ project, options, report }) {
    const linked = new Set(project.er.relations.flatMap((r) => [r.parent, r.child]));
    for (const e of project.er.entities.values()) {
      if (linked.has(e.name) || options.allow.includes(e.name)) continue;
      report({ doc: e.diagram.doc, line: e.line, message: `${e.name} がどの線にも出てこない` });
    }
  },
  invalid: [
    {
      name: "線の無いエンティティ",
      files: {
        "a.md": MD(
          "  USER {\n    int id PK\n  }\n  LOG {\n    int id PK\n  }\n  USER ||--o{ USER : x",
        ),
      },
    },
  ],
  valid: [
    {
      name: "allow に入れたもの",
      files: { "a.md": MD("  SETTING {\n    int id PK\n  }") },
      options: { allow: ["SETTING"] },
    },
  ],
});
