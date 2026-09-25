# mujun

> mujun（矛盾）= contradiction

> [!NOTE]
> 開発中（0.x）です。ルールや設定の形は変わることがあります。

Markdown で書いた設計書の中の矛盾を見つける Linter です。見るのは、ER 図・表・本文のあいだの食い違いです。

- ER 図の線はあるのに FK 列が無い、または FK 列はあるのに線が無い
- 本文に書いた `TABLE.column` が図に無い（図を直したのに本文が古いまま）
- 同じエンティティを2か所で定義している

文章の書き方（表記ゆれや文体）は textlint の担当なので、mujun では扱いません。

## 使い方

```sh
npm i -D mujun
```

```ts
// mujun.config.ts
import { defineConfig, recommended } from "mujun";
import myRules from "./tools/design-rules.ts";

export default defineConfig({
  files: ["docs/**/*.md"],
  ignores: ["docs/design-history.md"],
  rules: {
    ...recommended,
    "er/relation-fk": ["error", { external: ["USER", "TENANT"] }],
  },
  plugins: [...myRules],
});
```

```sh
npx mujun            # 検査。error が1件でもあれば終了コード 1
npx mujun selftest   # 各ルールが、自分の壊れた例で本当に落ちるかを確かめる
```

Node 24 以上が必要です。設定ファイルもローカルのルールも `.ts` のまま読み込むので、ビルドは要りません。

## selftest

検査が通っても、ルールが効いている証拠にはなりません。正規表現が何にも当たらなくなっていれば、ルールは何も言わずに通り続けます。

そこで mujun では、各ルールに「これなら落ちるはず」という壊れた例（`invalid`）を必ず書くことにしています。`mujun selftest` はそれぞれの例でルールを走らせ、次の3つのどれかに当たったルールを失敗として報告します。

- 壊れた例で落ちなかった
- 正しい例（`valid`）で落ちた
- 壊れた例が1つも書かれていない

壊れた例の書き方は2通りあります。

- **`files`**：小さな例文を書く。組み込みルールはこちら
- **`mutate`**：実物の設計書を書き換えて壊す。プロジェクト固有のルールは、実物の構造（構成表や図の並び）を前提にすることが多いので、例文を作るより実物を壊すほうが短く書けて確かです

```ts
invalid: [
  {
    name: "記録時刻を消す",
    mutate: { "docs/er.md": (t) => t.replace('        datetime recorded_at\n', "") },
  },
],
```

`mutate` の例は、設定ファイルの `files` を読み、書き換えてからルールを走らせます。元から出ている報告は数えず、書き換えで新しく出た報告があれば「落ちた」とみなします。書き換えが何も変えなかったとき（設計書の文言が変わって置換が当たらないとき）は、それ自体を失敗として報告します。

## ルール

| ルール                   | recommended | 見ること                                                       |
| ------------------------ | ----------- | -------------------------------------------------------------- |
| `mermaid/er-syntax`      | error       | erDiagram の行が ER 図の文法として読める                       |
| `er/relation-fk`         | error       | 図の線と FK 列が1対1で対応している                             |
| `er/duplicate-entity`    | error       | 同じエンティティを属性つきで2か所に定義していない              |
| `er/isolated-entity`     | warn        | どの線にも出てこないエンティティが無い                         |
| `prose/column-ref`       | error       | 本文の `` `TABLE.column` `` と `` `TABLE` `` が図に実在する    |
| `er/enum-table`          | error       | 列挙表に書いた値と、列コメントの値（`a / b / c`）が一致する    |
| `state/transition-table` | —           | 状態の列挙と遷移表が一致し、どの状態にも初期状態から辿り着ける |
| `count/declared`         | —           | 本文で宣言した数（「集約 7 種」）と、数えた数が一致する        |
| `ref/section`            | error       | 本文の `§N.N` が、同じ文書に実在する節を指している             |
| `ref/id`                 | —           | `D12` のような ID の参照先が定義されている（形は設定で渡す）   |
| `list/numbering`         | error       | 番号付きリストに欠番や重複が無い                               |
| `markdown/json-block`    | error       | json のコードブロックが JSON として読める                      |
| `prose/duplicate`        | warn        | 同じ主張を2つの節に書いていない                                |

### `er/relation-fk`

FK 列がどのエンティティを指すかは、次の順で決めます。

1. 設計書の中にある別名表。表の見出しが `| FK 列 | 参照先 |` で始まるもの（`aliasTable` で変えられます）

   ```md
   | FK 列       | 参照先                     |
   | ----------- | -------------------------- |
   | `author_id` | `USER`                     |
   | `parent_id` | 同じテーブル（親カテゴリ） |
   ```

2. 命名規約。列名の後ろの部分と一致するエンティティを探し、長い名前を優先します（`billing_address_id` → `ADDRESS`、`created_by_user_id` → `USER`）

別名は設定ファイルではなく設計書に書きます。検査の前提を設計書自身が宣言しておけば、設計書を直すときに一緒に目に入り、前提だけが古くなるのを防げます。

| オプション             | 既定値                | 意味                                                 |
| ---------------------- | --------------------- | ---------------------------------------------------- |
| `aliasTable`           | `["FK 列", "参照先"]` | 別名表の見出し行                                     |
| `convention`           | `true`                | 別名表に無い列に命名規約を当てる                     |
| `external`             | `[]`                  | 図の外にあるテーブル。これを指す FK には線を求めない |
| `requireRelationForFk` | `true`                | 「FK 列はあるのに線が無い」も報告する                |

親と子は、線を書いた左右ではなく多重度で決めます。`ORDER }o--|| USER` と書いても、親は `USER` です。

1 対 1 の線（`A |o--o| B`）と多対多の線（`A }o--o{ B`）は多重度で向きが決まらないので、どちらの側の FK にも対応できます。ただし 1 本が満たす FK は 1 方向だけです。`A.b_id` と `B.a_id` が互いを指すなら、線を 2 本引きます。

### `prose/column-ref`

本文のインラインコード `` `TABLE.column` `` と `` `TABLE` `` が、ER図に実在するかを見ます。図を直したのに本文が古いまま、を拾います。

| オプション      | 既定値                                          | 意味                                                                        |
| --------------- | ----------------------------------------------- | --------------------------------------------------------------------------- |
| `entityPattern` | `"[A-Z][A-Z0-9_]*"`                             | エンティティ名とみなす形                                                    |
| `bareEntity`    | `"underscore"`                                  | 列なしの `` `TABLE` `` を見る範囲。`underscore` は下線を含む名前だけ        |
| `strictFiles`   | `[]`                                            | `bareEntity` に関わらず、列なしの名前を全部見る文書（ER図を書いた文書など） |
| `allow`         | `["PK", "FK", "UK", "NULL", "TABLE", "ENTITY"]` | 見ない名前                                                                  |
| `ignoreFiles`   | `[]`                                            | 見ない文書（glob）                                                          |

`bareEntity` の既定が `underscore` なのは、`` `API` `` のような略語をテーブル名と取り違えないためです。

### `er/enum-table`

列挙の値を、ER図の列コメント（`"a / b / c"`）と列挙表の2か所に書くと、片方だけ直したときに食い違います。見出しが `| 列 | 値 |` で始まる表（`header` で変えられます）の各行について、1列目の `` `TABLE.column` `` の列コメントと、2列目の値が一致するかを見ます。1行に複数の列を並べれば、それらの語彙が揃っているかも見ます。

```md
| 列                        | 値                 |
| ------------------------- | ------------------ |
| `ORDER.status`            | `draft` `placed`   |
| `PLAN.kind` `ACTUAL.kind` | `material` `labor` |
```

### `state/transition-table`

状態を持つ列を設定で渡すと、その列コメントの値と、見出しに「遷移元」と「遷移先」（または `from` と `to`）を含む表を突き合わせます。

- 列挙にある状態が、遷移表に無い
- 遷移表にある状態が、列挙に無い（綴り違い）
- 初期状態から辿り着けない状態がある。初期状態は、遷移元が空の行（「（作成） | — | `draft`」）の行き先

```ts
"state/transition-table": ["error", {
  machines: [{ state: "ORDER.status", event: "ORDER_EVENT.event_type" }],
}],
```

`event` を渡すと、イベントの列挙が遷移表の1列目に全部出てくるかも見ます。

### `count/declared`

「集約 7 種」「24 テーブル」のような宣言と、実際に数えた数を突き合わせます。宣言の書き方はプロジェクトごとに違うので、形を設定で渡します。

```ts
"count/declared": ["error", {
  declarations: [
    {
      name: "集約",
      pattern: String.raw`集約 (\d+) 種`,
      of: { tableRows: ["集約", "中身"], file: "docs/design.md" },
    },
    { name: "テーブル", pattern: String.raw`(\d+) テーブル`, of: { entities: true } },
  ],
}],
```

数える対象（`of`）は、ER図のエンティティ（`entities`）、見出し行で探した表の行数（`tableRows`）、見出しの数（`headings`）のどれかです。

宣言の文言を変えると、正規表現が何にも当たらなくなり、検査が黙って通り続けます。なので、宣言が1つも見つからないときと、数える対象が見つからないときも報告します。

### `ref/id`

設計判断の番号（D1, D2 …）のように、プロジェクトごとに形が違う ID を見ます。形を設定で渡さないと何もしないので、recommended には入れていません。

```ts
"ref/id": ["error", {
  ids: [
    // 参照は本文のどこでも、定義は見出し「D12. 〜」
    { name: "設計判断", ref: String.raw`\bD(\d+)\b`, def: String.raw`^D(\d+)\.` },
    // 定義は表の1列目「U3」
    { name: "未決事項", ref: String.raw`\bU(\d+)\b`, def: String.raw`^U(\d+)$` },
  ],
  ignoreFiles: ["docs/design-history.md"],
}],
```

`def` は、すべての文書の見出しと、表の各行の1列目に当てます。

### `prose/duplicate`

同じ主張を2か所に書くと、片方だけ直したときに矛盾が生まれます。このルールは、文を5文字ずつの断片に分け、節をまたいで重なりの割合（Jaccard 係数）を比べます。

| オプション    | 既定値       | 意味                                         |
| ------------- | ------------ | -------------------------------------------- |
| `threshold`   | `0.4`        | これ以上重なっていれば報告する               |
| `minLength`   | `18`         | 記号を除いてこれより短い文は比べない         |
| `scope`       | `"document"` | `"project"` にすると、文書をまたいでも比べる |
| `ignoreFiles` | `[]`         | 見ない文書（glob）                           |

引用（`>`）の中と、太字だけの行（見出しの代わり）は比べません。

## プロジェクト固有のルール

効き目のある検査の多くは、そのプロジェクトで実際にやらかしたことから生まれます。なので mujun では、固有のルールを短く書けることを大事にしています。

````ts
import { defineRule } from "mujun";

export default defineRule({
  id: "local/history-immutable",
  description: "履歴テーブルは書き換えないので updated_at を持たない",
  defaultOptions: undefined,
  check({ project, report }) {
    for (const e of project.er.entities.values()) {
      if (!e.name.endsWith("_HISTORY")) continue;
      for (const a of e.attrs) {
        if (a.name === "updated_at") {
          report({ doc: e.diagram.doc, line: a.line, message: `${e.name}: 履歴は書き換えない` });
        }
      }
    }
  },
  invalid: [
    {
      name: "履歴に updated_at がある",
      files: {
        "er.md":
          "```mermaid\nerDiagram\n  ORDER_HISTORY {\n    int id PK\n    datetime updated_at\n  }\n```\n",
      },
    },
  ],
});
````

`project` の中身は次のとおりです。

- `project.docs`：各ファイルの見出し・表・mermaid ブロック・インラインコード（どれも行番号つき）
- `project.er`：全ファイルの ER 図をまとめたもの（エンティティ・属性・線・読めなかった行）

## 開発

```sh
pnpm install
pnpm check   # typecheck / lint / test / selftest
pnpm build   # dist/ に出力（npm pack / publish のときは prepack が自動で走らせる）
```
