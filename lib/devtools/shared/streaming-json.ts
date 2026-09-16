import { BoundedUtf8Preview } from "./bounded-text-preview.ts";

export type StreamingJsonInput = string | Blob | ReadableStream<Uint8Array>;

export type StreamingJsonMode = "validate" | "format" | "minify";
export type StreamingJsonIndentation = 2 | 4 | "tab";
export type StreamingJsonRootType = "array" | "boolean" | "null" | "number" | "object" | "string";

export type StreamingJsonError = {
  kind: "empty" | "encoding" | "syntax";
  message: string;
  line: number;
  column: number;
  /** Zero-based UTF-16 offset. */
  offset: number;
};

export type StreamingJsonResult =
  | {
      ok: true;
      inputBytes: number;
      inputCharacters: number;
      outputCharacters: number;
      preview: string;
      previewTruncated: boolean;
      rootType: StreamingJsonRootType;
    }
  | { ok: false; error: StreamingJsonError };

export type StreamingJsonOptions = {
  mode: StreamingJsonMode;
  indentation?: StreamingJsonIndentation;
  signal?: AbortSignal;
  /** Receives bounded output chunks in order. Not called in validate mode. */
  onOutput?: (chunk: string) => void | Promise<void>;
  /** Receives the cumulative UTF-8 bytes consumed from the input. */
  onInputProgress?: (bytes: number) => void;
  /** Receives UTF-8 output and is closed on success or aborted on failure. */
  writable?: WritableStream<Uint8Array>;
  outputChunkSize?: number;
  previewLimit?: number;
  maxDepth?: number;
};

type ObjectFrame = {
  kind: "object";
  state: "first-key-or-end" | "key" | "colon" | "value" | "comma-or-end";
  count: number;
};

type ArrayFrame = {
  kind: "array";
  state: "first-value-or-end" | "value" | "comma-or-end";
  count: number;
};

type Frame = ObjectFrame | ArrayFrame;

type NumberState =
  "minus" | "zero" | "integer" | "decimal-point" | "fraction" | "exponent" | "exponent-sign" | "exponent-digits";

type TokenState =
  | { kind: "default" }
  | {
      kind: "string";
      role: "key" | "value";
      escaped: boolean;
      unicodeDigits: number;
    }
  | { kind: "literal"; word: "true" | "false" | "null"; index: number }
  | { kind: "number"; state: NumberState };

class JsonStreamParseError extends Error {
  readonly detail: StreamingJsonError;

  constructor(detail: StreamingJsonError) {
    super(detail.message);
    this.name = "JsonStreamParseError";
    this.detail = detail;
  }
}

class OutputSink {
  characters = 0;

  private buffer = "";
  private readonly encoder = new TextEncoder();
  private readonly enabled: boolean;
  private readonly chunkSize: number;
  private readonly onOutput?: (chunk: string) => void | Promise<void>;
  private readonly preview: BoundedUtf8Preview;
  private readonly writer?: WritableStreamDefaultWriter<Uint8Array>;

  constructor(
    enabled: boolean,
    chunkSize: number,
    previewLimit: number,
    onOutput?: (chunk: string) => void | Promise<void>,
    writable?: WritableStream<Uint8Array>,
  ) {
    this.enabled = enabled;
    this.chunkSize = chunkSize;
    this.onOutput = onOutput;
    this.preview = new BoundedUtf8Preview(previewLimit);
    this.writer = writable?.getWriter();
  }

  append(value: string) {
    if (!this.enabled || value.length === 0) return;

    this.characters += value.length;
    this.buffer += value;
  }

  get needsFlush() {
    return this.safeChunkLength() > 0;
  }

  flush() {
    return this.flushReady(false);
  }

  async finish() {
    if (this.enabled) await this.flushReady(true);
    await this.writer?.close();
  }

  async abort(reason: unknown) {
    this.buffer = "";
    if (!this.writer) return;
    try {
      await this.writer.abort(reason);
    } catch {
      // Preserve the processing error rather than a secondary sink error.
    }
  }

  getPreview() {
    return {
      preview: this.preview.value,
      previewTruncated: this.preview.truncated,
    };
  }

  private safeChunkLength(force = false) {
    if (this.buffer.length === 0) return 0;
    if (!force && this.buffer.length < this.chunkSize) return 0;

    let length = Math.min(this.chunkSize, this.buffer.length);
    const last = this.buffer.charCodeAt(length - 1);
    const next = this.buffer.charCodeAt(length);

    if (last >= 0xd800 && last <= 0xdbff) {
      if (length === this.buffer.length && !force) return 0;
      if (next >= 0xdc00 && next <= 0xdfff) length -= 1;
    }

    return length;
  }

  private async flushReady(force: boolean) {
    while (true) {
      const length = this.safeChunkLength(force);
      if (length === 0) return;

      const chunk = this.buffer.slice(0, length);
      this.buffer = this.buffer.slice(length);
      this.preview.append(chunk);
      if (this.onOutput) await this.onOutput(chunk);
      if (this.writer) await this.writer.write(this.encoder.encode(chunk));

      if (!force && this.buffer.length < this.chunkSize) return;
    }
  }
}

class IncrementalJsonParser {
  line = 1;
  column = 1;
  offset = 0;
  sawToken = false;
  rootType: StreamingJsonRootType | null = null;

  private token: TokenState = { kind: "default" };
  private readonly frames: Frame[] = [];
  private rootComplete = false;
  private previousWasCarriageReturn = false;
  private processedSinceAbortCheck = 0;
  private readonly mode: StreamingJsonMode;
  private readonly output: OutputSink;
  private readonly signal?: AbortSignal;
  private readonly maxDepth: number;

  constructor(
    mode: StreamingJsonMode,
    indentation: StreamingJsonIndentation,
    output: OutputSink,
    signal?: AbortSignal,
    maxDepth = 512,
  ) {
    this.mode = mode;
    this.output = output;
    this.signal = signal;
    this.maxDepth = maxDepth;
    this.indent = indentation === "tab" ? "\t" : " ".repeat(indentation);
  }

  private readonly indent: string;

  async write(value: string) {
    for (let index = 0; index < value.length; index += 1) {
      this.processedSinceAbortCheck += 1;
      if (this.processedSinceAbortCheck >= 4096) {
        throwIfAborted(this.signal);
        this.processedSinceAbortCheck = 0;
      }
      this.consume(value[index]);
      if (this.output.needsFlush) await this.output.flush();
    }
  }

  finish() {
    throwIfAborted(this.signal);

    if (this.token.kind === "number") {
      if (!isCompleteNumberState(this.token.state)) {
        this.fail("JSON ended in the middle of a number.");
      }
      this.token = { kind: "default" };
      this.completeValue();
    } else if (this.token.kind === "string") {
      this.fail(
        this.token.unicodeDigits > 0
          ? "JSON ended in the middle of a Unicode escape sequence."
          : "JSON ended before the string was closed.",
      );
    } else if (this.token.kind === "literal") {
      this.fail(`JSON ended before ${this.token.word} was complete.`);
    }

    if (!this.sawToken) {
      this.fail("JSON input is empty.", "empty");
    }
    if (this.frames.length > 0) {
      const frame = this.frames.at(-1);
      this.fail(`JSON ended before the ${frame?.kind ?? "container"} was closed.`);
    }
    if (!this.rootComplete) this.fail("JSON ended before a value was complete.");
  }

  private consume(character: string) {
    let consumed = false;

    while (!consumed) {
      switch (this.token.kind) {
        case "string":
          this.consumeString(character);
          consumed = true;
          break;
        case "literal":
          this.consumeLiteral(character);
          consumed = true;
          break;
        case "number":
          consumed = this.consumeNumber(character);
          break;
        default:
          this.consumeDefault(character);
          consumed = true;
      }
    }
  }

  private consumeDefault(character: string) {
    if (isJsonWhitespace(character)) {
      this.advance(character);
      return;
    }

    if (this.rootComplete && this.frames.length === 0) {
      this.fail("Only one top-level JSON value is allowed.");
    }

    switch (character) {
      case "{":
        if (this.frames.length >= this.maxDepth) {
          this.fail(`JSON nesting exceeds the ${this.maxDepth.toLocaleString("en-US")} level limit.`);
        }
        this.beginValue();
        if (this.rootType === null && this.frames.length === 0) this.rootType = "object";
        this.emit("{");
        this.frames.push({
          kind: "object",
          state: "first-key-or-end",
          count: 0,
        });
        this.sawToken = true;
        this.advance(character);
        return;
      case "[":
        if (this.frames.length >= this.maxDepth) {
          this.fail(`JSON nesting exceeds the ${this.maxDepth.toLocaleString("en-US")} level limit.`);
        }
        this.beginValue();
        if (this.rootType === null && this.frames.length === 0) this.rootType = "array";
        this.emit("[");
        this.frames.push({
          kind: "array",
          state: "first-value-or-end",
          count: 0,
        });
        this.sawToken = true;
        this.advance(character);
        return;
      case "}":
        this.closeObject();
        this.advance(character);
        return;
      case "]":
        this.closeArray();
        this.advance(character);
        return;
      case ",":
        this.consumeComma();
        this.advance(character);
        return;
      case ":":
        this.consumeColon();
        this.advance(character);
        return;
      case '"':
        if (this.rootType === null && this.frames.length === 0) this.rootType = "string";
        this.beginString();
        this.advance(character);
        return;
      case "t":
        if (this.rootType === null && this.frames.length === 0) this.rootType = "boolean";
        this.beginScalar();
        this.token = { kind: "literal", word: "true", index: 0 };
        this.consumeLiteral(character);
        return;
      case "f":
        if (this.rootType === null && this.frames.length === 0) this.rootType = "boolean";
        this.beginScalar();
        this.token = { kind: "literal", word: "false", index: 0 };
        this.consumeLiteral(character);
        return;
      case "n":
        if (this.rootType === null && this.frames.length === 0) this.rootType = "null";
        this.beginScalar();
        this.token = { kind: "literal", word: "null", index: 0 };
        this.consumeLiteral(character);
        return;
      case "-":
        if (this.rootType === null && this.frames.length === 0) this.rootType = "number";
        this.beginNumber("minus", character);
        return;
      case "0":
        if (this.rootType === null && this.frames.length === 0) this.rootType = "number";
        this.beginNumber("zero", character);
        return;
      default:
        if (character >= "1" && character <= "9") {
          if (this.rootType === null && this.frames.length === 0) this.rootType = "number";
          this.beginNumber("integer", character);
          return;
        }
        this.fail(`Unexpected character ${JSON.stringify(character)}.`);
    }
  }

  private beginString() {
    const frame = this.frames.at(-1);
    const isKey = frame?.kind === "object" && (frame.state === "first-key-or-end" || frame.state === "key");

    if (isKey) {
      if (frame.state === "first-key-or-end") this.emitItemIndent();
    } else {
      this.beginScalar();
    }

    this.emit('"');
    this.token = {
      kind: "string",
      role: isKey ? "key" : "value",
      escaped: false,
      unicodeDigits: 0,
    };
    this.sawToken = true;
  }

  private consumeString(character: string) {
    const token = this.token;
    if (token.kind !== "string") return;

    if (token.unicodeDigits > 0) {
      if (!isHexDigit(character)) {
        this.fail("Unicode escapes must contain exactly four hexadecimal digits.");
      }
      this.emit(character);
      token.unicodeDigits -= 1;
      if (token.unicodeDigits === 0) token.escaped = false;
      this.advance(character);
      return;
    }

    if (token.escaped) {
      if (!'"\\/bfnrtu'.includes(character)) {
        this.fail(`Invalid string escape \\${character}.`);
      }
      this.emit(character);
      if (character === "u") token.unicodeDigits = 4;
      else token.escaped = false;
      this.advance(character);
      return;
    }

    if (character === "\\") {
      token.escaped = true;
      this.emit(character);
      this.advance(character);
      return;
    }

    if (character === '"') {
      this.emit(character);
      this.advance(character);
      this.token = { kind: "default" };

      if (token.role === "key") {
        const frame = this.frames.at(-1);
        if (frame?.kind !== "object") this.fail("Object key is out of place.");
        frame.state = "colon";
      } else {
        this.completeValue();
      }
      return;
    }

    if (character.charCodeAt(0) <= 0x1f) {
      this.fail("Control characters inside strings must be escaped.");
    }

    this.emit(character);
    this.advance(character);
  }

  private consumeLiteral(character: string) {
    const token = this.token;
    if (token.kind !== "literal") return;

    if (character !== token.word[token.index]) {
      this.fail(`Invalid literal; expected ${token.word}.`);
    }

    this.emit(character);
    this.advance(character);
    token.index += 1;
    if (token.index === token.word.length) {
      this.token = { kind: "default" };
      this.completeValue();
    }
  }

  private beginNumber(state: NumberState, character: string) {
    this.beginScalar();
    this.token = { kind: "number", state };
    this.sawToken = true;
    this.emit(character);
    this.advance(character);
  }

  private consumeNumber(character: string) {
    const token = this.token;
    if (token.kind !== "number") return true;
    const digit = character >= "0" && character <= "9";

    switch (token.state) {
      case "minus":
        if (!digit) this.fail("A minus sign must be followed by a digit.");
        token.state = character === "0" ? "zero" : "integer";
        break;
      case "zero":
        if (digit) this.fail("Leading zeroes are not allowed in JSON numbers.");
        if (character === ".") token.state = "decimal-point";
        else if (character === "e" || character === "E") token.state = "exponent";
        else return this.finishNumberWithoutConsuming();
        break;
      case "integer":
        if (digit) break;
        if (character === ".") token.state = "decimal-point";
        else if (character === "e" || character === "E") token.state = "exponent";
        else return this.finishNumberWithoutConsuming();
        break;
      case "decimal-point":
        if (!digit) this.fail("A decimal point must be followed by a digit.");
        token.state = "fraction";
        break;
      case "fraction":
        if (digit) break;
        if (character === "e" || character === "E") token.state = "exponent";
        else return this.finishNumberWithoutConsuming();
        break;
      case "exponent":
        if (character === "+" || character === "-") token.state = "exponent-sign";
        else if (digit) token.state = "exponent-digits";
        else this.fail("A JSON number exponent must contain a digit.");
        break;
      case "exponent-sign":
        if (!digit) this.fail("A JSON number exponent sign must be followed by a digit.");
        token.state = "exponent-digits";
        break;
      case "exponent-digits":
        if (!digit) return this.finishNumberWithoutConsuming();
        break;
    }

    this.emit(character);
    this.advance(character);
    return true;
  }

  private finishNumberWithoutConsuming() {
    const token = this.token;
    if (token.kind !== "number" || !isCompleteNumberState(token.state)) {
      this.fail("Invalid JSON number.");
    }
    this.token = { kind: "default" };
    this.completeValue();
    return false;
  }

  private beginScalar() {
    this.beginValue();
    this.sawToken = true;
  }

  private beginValue() {
    const frame = this.frames.at(-1);
    if (!frame) {
      if (this.rootComplete) this.fail("Only one top-level JSON value is allowed.");
      return;
    }

    if (frame.kind === "array") {
      if (frame.state === "first-value-or-end") {
        this.emitItemIndent();
        return;
      }
      if (frame.state === "value") return;
      this.fail("Expected a comma or closing bracket before another array value.");
    }

    if (frame.state !== "value") {
      this.fail("Expected an object key before this value.");
    }
  }

  private completeValue() {
    const frame = this.frames.at(-1);
    if (!frame) {
      this.rootComplete = true;
      return;
    }

    if (frame.kind === "array") {
      if (frame.state !== "first-value-or-end" && frame.state !== "value") {
        this.fail("Array value is out of place.");
      }
      frame.count += 1;
      frame.state = "comma-or-end";
      return;
    }

    if (frame.state !== "value") this.fail("Object value is out of place.");
    frame.count += 1;
    frame.state = "comma-or-end";
  }

  private consumeComma() {
    const frame = this.frames.at(-1);
    if (!frame || frame.state !== "comma-or-end") {
      this.fail("Unexpected comma.");
    }

    frame.state = frame.kind === "array" ? "value" : "key";
    this.emit(",");
    if (this.mode === "format") {
      this.emit(`\n${this.indent.repeat(this.frames.length)}`);
    }
  }

  private consumeColon() {
    const frame = this.frames.at(-1);
    if (frame?.kind !== "object" || frame.state !== "colon") {
      this.fail("Unexpected colon.");
    }

    frame.state = "value";
    this.emit(this.mode === "format" ? ": " : ":");
  }

  private closeObject() {
    const frame = this.frames.at(-1);
    if (frame?.kind !== "object") this.fail("Unexpected closing brace.");
    if (frame.state === "key") {
      this.fail("Trailing commas are not allowed in objects.");
    }
    if (frame.state !== "first-key-or-end" && frame.state !== "comma-or-end") {
      this.fail("Object ended before its property was complete.");
    }

    if (this.mode === "format" && frame.count > 0) {
      this.emit(`\n${this.indent.repeat(this.frames.length - 1)}`);
    }
    this.emit("}");
    this.frames.pop();
    this.completeValue();
  }

  private closeArray() {
    const frame = this.frames.at(-1);
    if (frame?.kind !== "array") this.fail("Unexpected closing bracket.");
    if (frame.state === "value") {
      this.fail("Trailing commas are not allowed in arrays.");
    }
    if (frame.state !== "first-value-or-end" && frame.state !== "comma-or-end") {
      this.fail("Array ended before its value was complete.");
    }

    if (this.mode === "format" && frame.count > 0) {
      this.emit(`\n${this.indent.repeat(this.frames.length - 1)}`);
    }
    this.emit("]");
    this.frames.pop();
    this.completeValue();
  }

  private emitItemIndent() {
    if (this.mode === "format") {
      this.emit(`\n${this.indent.repeat(this.frames.length)}`);
    }
  }

  private emit(value: string) {
    this.output.append(value);
  }

  private advance(character: string) {
    this.offset += 1;

    if (character === "\r") {
      this.line += 1;
      this.column = 1;
      this.previousWasCarriageReturn = true;
      return;
    }
    if (character === "\n") {
      if (!this.previousWasCarriageReturn) this.line += 1;
      this.column = 1;
      this.previousWasCarriageReturn = false;
      return;
    }

    this.column += 1;
    this.previousWasCarriageReturn = false;
  }

  private fail(message: string, kind: StreamingJsonError["kind"] = "syntax"): never {
    throw new JsonStreamParseError({
      kind,
      message,
      line: this.line,
      column: this.column,
      offset: this.offset,
    });
  }
}

function isJsonWhitespace(value: string) {
  return value === " " || value === "\t" || value === "\n" || value === "\r";
}

function isHexDigit(value: string) {
  return (value >= "0" && value <= "9") || (value >= "a" && value <= "f") || (value >= "A" && value <= "F");
}

function isCompleteNumberState(state: NumberState) {
  return state === "zero" || state === "integer" || state === "fraction" || state === "exponent-digits";
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

function utf8ByteLength(value: string) {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function isBlob(value: StreamingJsonInput): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

async function feedByteStream(
  stream: ReadableStream<Uint8Array>,
  parser: IncrementalJsonParser,
  rawPreview: BoundedUtf8Preview | undefined,
  signal: AbortSignal | undefined,
  onInputProgress: StreamingJsonOptions["onInputProgress"],
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let inputBytes = 0;
  let inputCharacters = 0;
  let complete = false;
  const cancel = () => void reader.cancel(signal?.reason).catch(() => undefined);
  signal?.addEventListener("abort", cancel, { once: true });

  try {
    while (true) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      throwIfAborted(signal);
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        throw new TypeError("Streaming JSON input must contain Uint8Array chunks.");
      }

      inputBytes += value.byteLength;
      onInputProgress?.(inputBytes);
      let text: string;
      try {
        text = decoder.decode(value, { stream: true });
      } catch {
        throw new JsonStreamParseError({
          kind: "encoding",
          message: "JSON file is not valid UTF-8.",
          line: parser.line,
          column: parser.column,
          offset: parser.offset,
        });
      }
      inputCharacters += text.length;
      rawPreview?.append(text);
      await parser.write(text);
    }

    let tail: string;
    try {
      tail = decoder.decode();
    } catch {
      throw new JsonStreamParseError({
        kind: "encoding",
        message: "JSON file is not valid UTF-8.",
        line: parser.line,
        column: parser.column,
        offset: parser.offset,
      });
    }
    inputCharacters += tail.length;
    rawPreview?.append(tail);
    await parser.write(tail);
    complete = true;
    return { inputBytes, inputCharacters };
  } finally {
    signal?.removeEventListener("abort", cancel);
    if (!complete) {
      try {
        await reader.cancel();
      } catch {
        // The original parsing, encoding, or abort error is more useful.
      }
    }
    reader.releaseLock();
  }
}

/**
 * Strictly validates and optionally rewrites JSON without constructing its
 * value or accumulating its complete output in memory.
 */
export async function processStreamingJson(
  input: StreamingJsonInput,
  options: StreamingJsonOptions,
): Promise<StreamingJsonResult> {
  throwIfAborted(options.signal);
  if (options.mode !== "validate" && options.mode !== "format" && options.mode !== "minify") {
    throw new TypeError(`Unsupported streaming JSON mode: ${String(options.mode)}.`);
  }
  if (options.onOutput && options.writable) {
    throw new TypeError("Use either onOutput or writable, not both.");
  }

  const outputChunkSize = options.outputChunkSize ?? 64 * 1024;
  const previewLimit = options.previewLimit ?? 0;
  const maxDepth = options.maxDepth ?? 512;
  if (!Number.isSafeInteger(outputChunkSize) || outputChunkSize < 2) {
    throw new RangeError("outputChunkSize must be an integer of at least 2.");
  }
  if (!Number.isSafeInteger(previewLimit) || previewLimit < 0) {
    throw new RangeError("previewLimit must be a non-negative integer.");
  }
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 1) {
    throw new RangeError("maxDepth must be a positive integer.");
  }

  const indentation = options.indentation ?? 2;
  if (indentation !== 2 && indentation !== 4 && indentation !== "tab") {
    throw new TypeError("indentation must be 2, 4, or tab.");
  }

  const mode = options.mode;
  const output = new OutputSink(mode !== "validate", outputChunkSize, previewLimit, options.onOutput, options.writable);
  const rawPreview = mode === "validate" ? new BoundedUtf8Preview(previewLimit) : undefined;
  const parser = new IncrementalJsonParser(mode, indentation, output, options.signal, maxDepth);

  try {
    let inputBytes: number;
    let inputCharacters: number;

    if (typeof input === "string") {
      inputBytes = utf8ByteLength(input);
      inputCharacters = input.length;
      options.onInputProgress?.(inputBytes);
      rawPreview?.append(input);
      await parser.write(input);
    } else {
      const stream = isBlob(input) ? input.stream() : input;
      ({ inputBytes, inputCharacters } = await feedByteStream(
        stream,
        parser,
        rawPreview,
        options.signal,
        options.onInputProgress,
      ));
    }

    await parser.finish();
    await output.finish();
    const preview = rawPreview
      ? { preview: rawPreview.value, previewTruncated: rawPreview.truncated }
      : output.getPreview();

    return {
      ok: true,
      inputBytes,
      inputCharacters,
      outputCharacters: output.characters,
      ...preview,
      rootType: parser.rootType ?? "null",
    };
  } catch (error) {
    await output.abort(error);
    if (error instanceof JsonStreamParseError) {
      return { ok: false, error: error.detail };
    }
    throw error;
  }
}
