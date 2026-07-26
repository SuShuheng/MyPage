import type { DataValue } from "./data-types";

type Primitive = DataValue | undefined;
type TokenKind =
  | "number"
  | "string"
  | "identifier"
  | "operator"
  | "leftParen"
  | "rightParen"
  | "comma"
  | "eof";

interface Token {
  kind: TokenKind;
  value: string;
}

export class SafeExpressionEngine {
  public evaluate(
    expression: string,
    fields: Record<string, DataValue>,
  ): Primitive {
    if (expression.length > 1_000) {
      throw new Error("Expression exceeds the 1,000 character limit.");
    }
    const parser = new ExpressionParser(tokenize(expression), fields);
    const result = parser.parse();
    parser.expectEnd();
    return normalizeValue(result);
  }

  public validate(expression: string): string[] {
    try {
      this.evaluate(expression, {});
      return [];
    } catch (error) {
      return [error instanceof Error ? error.message : String(error)];
    }
  }
}

class ExpressionParser {
  private index = 0;
  private operations = 0;

  public constructor(
    private readonly tokens: Token[],
    private readonly fields: Record<string, DataValue>,
  ) {}

  public parse(): Primitive {
    return this.parseOr();
  }

  public expectEnd(): void {
    if (this.current.kind !== "eof") {
      throw new Error(`Unexpected token "${this.current.value}".`);
    }
  }

  private parseOr(): Primitive {
    let value = this.parseAnd();
    while (this.matchOperator("||")) {
      value = Boolean(value) || Boolean(this.parseAnd());
      this.tick();
    }
    return value;
  }

  private parseAnd(): Primitive {
    let value = this.parseEquality();
    while (this.matchOperator("&&")) {
      value = Boolean(value) && Boolean(this.parseEquality());
      this.tick();
    }
    return value;
  }

  private parseEquality(): Primitive {
    let value = this.parseComparison();
    while (this.isOperator("==", "!=")) {
      const operator = this.advance().value;
      const right = this.parseComparison();
      value = operator === "==" ? valuesEqual(value, right) : !valuesEqual(value, right);
      this.tick();
    }
    return value;
  }

  private parseComparison(): Primitive {
    let value = this.parseAdditive();
    while (this.isOperator(">", ">=", "<", "<=")) {
      const operator = this.advance().value;
      const right = this.parseAdditive();
      const comparison = compare(value, right);
      value =
        operator === ">" ? comparison > 0 :
        operator === ">=" ? comparison >= 0 :
        operator === "<" ? comparison < 0 :
        comparison <= 0;
      this.tick();
    }
    return value;
  }

  private parseAdditive(): Primitive {
    let value = this.parseMultiplicative();
    while (this.isOperator("+", "-")) {
      const operator = this.advance().value;
      const right = this.parseMultiplicative();
      value =
        operator === "+"
          ? typeof value === "string" || typeof right === "string"
            ? `${value ?? ""}${right ?? ""}`
            : toNumber(value) + toNumber(right)
          : toNumber(value) - toNumber(right);
      this.tick();
    }
    return value;
  }

  private parseMultiplicative(): Primitive {
    let value = this.parseUnary();
    while (this.isOperator("*", "/", "%")) {
      const operator = this.advance().value;
      const right = toNumber(this.parseUnary());
      const left = toNumber(value);
      if ((operator === "/" || operator === "%") && right === 0) {
        throw new Error("Division by zero is not allowed.");
      }
      value = operator === "*" ? left * right : operator === "/" ? left / right : left % right;
      this.tick();
    }
    return value;
  }

  private parseUnary(): Primitive {
    if (this.matchOperator("!")) {
      this.tick();
      return !this.parseUnary();
    }
    if (this.matchOperator("-")) {
      this.tick();
      return -toNumber(this.parseUnary());
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Primitive {
    const token = this.advance();
    if (token.kind === "number") return Number(token.value);
    if (token.kind === "string") return token.value;
    if (token.kind === "leftParen") {
      const value = this.parseOr();
      this.expect("rightParen");
      return value;
    }
    if (token.kind !== "identifier") {
      throw new Error(`Unexpected token "${token.value}".`);
    }
    if (token.value === "true") return true;
    if (token.value === "false") return false;
    if (token.value === "null") return null;

    if (this.current.kind === "leftParen") {
      this.advance();
      const args: Primitive[] = [];
      if (!this.currentIs("rightParen")) {
        do {
          args.push(this.parseOr());
        } while (this.match("comma"));
      }
      this.expect("rightParen");
      this.tick();
      return callFunction(token.value, args);
    }
    return readPath(this.fields, token.value);
  }

  private get current(): Token {
    return this.tokens[this.index] ?? { kind: "eof", value: "" };
  }

  private advance(): Token {
    const current = this.current;
    this.index += 1;
    return current;
  }

  private match(kind: TokenKind): boolean {
    if (this.current.kind !== kind) return false;
    this.advance();
    return true;
  }

  private currentIs(kind: TokenKind): boolean {
    return this.current.kind === kind;
  }

  private expect(kind: TokenKind): void {
    if (!this.match(kind)) {
      throw new Error(`Expected ${kind}, received "${this.current.value}".`);
    }
  }

  private isOperator(...operators: string[]): boolean {
    return (
      this.current.kind === "operator" &&
      operators.includes(this.current.value)
    );
  }

  private matchOperator(operator: string): boolean {
    if (!this.isOperator(operator)) return false;
    this.advance();
    return true;
  }

  private tick(): void {
    this.operations += 1;
    if (this.operations > 1_000) {
      throw new Error("Expression exceeded its operation limit.");
    }
  }
}

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < expression.length) {
    const char = expression[index] ?? "";
    if (/\s/u.test(char)) {
      index += 1;
      continue;
    }
    if (/\d/u.test(char) || (char === "." && /\d/u.test(expression[index + 1] ?? ""))) {
      const start = index;
      index += 1;
      while (/[\d.]/u.test(expression[index] ?? "")) index += 1;
      const value = expression.slice(start, index);
      if (!Number.isFinite(Number(value))) throw new Error(`Invalid number "${value}".`);
      tokens.push({ kind: "number", value });
      continue;
    }
    if (char === "'" || char === "\"") {
      const quote = char;
      let value = "";
      index += 1;
      let closed = false;
      while (index < expression.length) {
        const next = expression[index] ?? "";
        index += 1;
        if (next === quote) {
          closed = true;
          break;
        }
        if (next === "\\") {
          const escaped = expression[index] ?? "";
          index += 1;
          value += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
        } else {
          value += next;
        }
      }
      if (!closed) throw new Error("Unterminated string literal.");
      tokens.push({ kind: "string", value });
      continue;
    }
    if (/[A-Za-z_]/u.test(char)) {
      const start = index;
      index += 1;
      while (/[A-Za-z0-9_.]/u.test(expression[index] ?? "")) index += 1;
      tokens.push({ kind: "identifier", value: expression.slice(start, index) });
      continue;
    }
    const pair = expression.slice(index, index + 2);
    if (["&&", "||", "==", "!=", ">=", "<="].includes(pair)) {
      tokens.push({ kind: "operator", value: pair });
      index += 2;
      continue;
    }
    if (["+", "-", "*", "/", "%", "!", ">", "<"].includes(char)) {
      tokens.push({ kind: "operator", value: char });
      index += 1;
      continue;
    }
    if (char === "(") tokens.push({ kind: "leftParen", value: char });
    else if (char === ")") tokens.push({ kind: "rightParen", value: char });
    else if (char === ",") tokens.push({ kind: "comma", value: char });
    else throw new Error(`Unsupported character "${char}".`);
    index += 1;
  }
  tokens.push({ kind: "eof", value: "" });
  return tokens;
}

function callFunction(name: string, args: Primitive[]): Primitive {
  switch (name) {
    case "lower":
      return String(args[0] ?? "").toLocaleLowerCase();
    case "upper":
      return String(args[0] ?? "").toLocaleUpperCase();
    case "length": {
      const value = args[0];
      return typeof value === "string" || Array.isArray(value)
        ? value.length
        : value && typeof value === "object"
          ? Object.keys(value).length
          : 0;
    }
    case "coalesce":
      return args.find((value) => value !== null && value !== undefined) ?? null;
    case "round":
      return Math.round(toNumber(args[0]) * 10 ** toNumber(args[1] ?? 0)) /
        10 ** toNumber(args[1] ?? 0);
    case "abs":
      return Math.abs(toNumber(args[0]));
    case "min":
      return Math.min(...args.map(toNumber));
    case "max":
      return Math.max(...args.map(toNumber));
    case "date":
      return Date.parse(String(args[0] ?? ""));
    case "daysBetween":
      return Math.floor(
        Math.abs(toNumber(args[0]) - toNumber(args[1])) / 86_400_000,
      );
    default:
      throw new Error(`Function "${name}" is not allowed.`);
  }
}

function readPath(
  fields: Record<string, DataValue>,
  path: string,
): Primitive {
  if (hasOwn(fields, path)) return fields[path];
  let current: unknown = fields;
  for (const segment of path.split(".")) {
    if (
      typeof current !== "object" ||
      current === null ||
      Array.isArray(current) ||
      !hasOwn(current, segment)
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return normalizeValue(current);
}

function normalizeValue(value: unknown): Primitive {
  if (
    value === undefined ||
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item) ?? null);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeValue(item) ?? null]),
    );
  }
  return String(value);
}

function toNumber(value: Primitive): number {
  const result = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(result)) throw new Error(`"${String(value)}" is not numeric.`);
  return result;
}

function valuesEqual(left: Primitive, right: Primitive): boolean {
  if (typeof left === "object" || typeof right === "object") {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return left === right;
}

function compare(left: Primitive, right: Primitive): number {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left ?? "").localeCompare(String(right ?? ""));
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
