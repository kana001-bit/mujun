import type { AnyRule } from "../types.ts";
import columnRef from "./column-ref.ts";
import { duplicateEntity, isolatedEntity } from "./entity.ts";
import erSyntax from "./er-syntax.ts";
import relationFk from "./relation-fk.ts";

export const builtinRules: AnyRule[] = [
  erSyntax,
  relationFk,
  duplicateEntity,
  isolatedEntity,
  columnRef,
];
