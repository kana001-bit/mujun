// mujun の公開型。ルールは Project（解析済みの設計書一式）を受け取り、矛盾を report する。

// ---------------------------------------------------------------- 解析結果

export type Heading = { depth: number; text: string; line: number };

// ```mermaid のブロック。head は直前の見出し、line は本文 1 行目（```mermaid の次の行）の行番号
export type MermaidBlock = { head: string; kind: string; body: string[]; line: number };

// GFM の表。header はセルの文字列、rows はセルの文字列（書式は落とさない。`x` や **x** はそのまま）
export type Table = { header: string[]; rows: TableRow[]; line: number; head: string };
export type TableRow = { cells: string[]; line: number };

// 本文（コードブロックの外）のインラインコード `x`
export type CodeSpan = { value: string; line: number };

export type Doc = {
  path: string; // config のあるディレクトリからの相対パス（/ 区切り）
  text: string;
  headings: Heading[];
  mermaid: MermaidBlock[];
  tables: Table[];
  codeSpans: CodeSpan[];
};

export type Attr = {
  type: string;
  name: string;
  keys: ReadonlySet<string>; // PK / FK / UK
  comment: string;
  line: number;
};
export type Entity = { name: string; attrs: Attr[]; diagram: ErDiagram; line: number };
// parent は「1」の側、child は「多」の側（FK を持つ側）。書いた左右ではなく多重度で決める。
// 1:1 と 多:多 は決められないので ambiguous（parent は左、child は右）
export type Relation = {
  parent: string;
  child: string;
  ambiguous: boolean;
  dashed: boolean;
  label: string;
  diagram: ErDiagram;
  line: number;
};
export type ErDiagram = {
  doc: Doc;
  block: MermaidBlock;
  entities: Entity[];
  relations: Relation[];
};
export type ErSyntaxError = { doc: Doc; line: number; message: string };

export type ErModel = {
  diagrams: ErDiagram[];
  // 同じ名前のエンティティが複数の図で属性つきで定義されていれば、最初のもの
  entities: ReadonlyMap<string, Entity>;
  relations: Relation[];
  errors: ErSyntaxError[];
};

export type Project = {
  docs: Doc[];
  doc(path: string): Doc | undefined;
  er: ErModel;
};

// ---------------------------------------------------------------- ルール

export type Severity = "error" | "warn" | "off";

export type Location = { doc: Doc | string; line?: number };
export type Report = { message: string } & Partial<Location>;

export type RuleContext<Options> = {
  project: Project;
  options: Options;
  report: (r: Report) => void;
};

// ルールを落とすはずの壊れた例。selftest は「invalid が必ず落ちる」「valid は通る」を確かめる。
// files はパス → Markdown。options は defaultOptions に上書きで混ぜる。
export type RuleCase<Options> = {
  name: string;
  files: Record<string, string>;
  options?: Partial<Options>;
};

export type Rule<Options = undefined> = {
  id: string; // "er/relation-fk" のように <分類>/<名前>
  description: string;
  defaultOptions: Options;
  // メソッド記法にしておくと引数が双変になり、Rule<X> を AnyRule（Rule<unknown>）に入れられる
  check(ctx: RuleContext<Options>): void;
  // 壊すと落ちること。1 件以上ないルールは selftest で失敗扱い
  invalid: RuleCase<Options>[];
  valid?: RuleCase<Options>[];
};

// 型引数を消したルール。config やプラグインの配列にまとめて入れるとき用
export type AnyRule = Rule<unknown>;

export type RuleSetting = Severity | [Severity] | [Severity, unknown];

export type Config = {
  files: string[]; // glob。config のあるディレクトリから
  ignores?: string[];
  rules: Record<string, RuleSetting>;
  plugins?: AnyRule[];
};

export type Problem = {
  ruleId: string;
  severity: Exclude<Severity, "off">;
  message: string;
  path?: string;
  line?: number;
};
