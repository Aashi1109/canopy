/** Captures a UTF-8 prefix without splitting a multi-byte character. */
export class BoundedUtf8Preview {
  value = "";
  truncated = false;

  private bytes = 0;
  private readonly decoder = new TextDecoder("utf-8", { fatal: true });
  private readonly encoder = new TextEncoder();
  private readonly limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  append(value: string): void {
    if (value.length === 0) return;
    const encoded = this.encoder.encode(value);
    const remaining = this.limit - this.bytes;
    if (encoded.byteLength <= remaining) {
      this.value += value;
      this.bytes += encoded.byteLength;
      return;
    }

    this.truncated = true;
    if (remaining <= 0) return;
    for (let length = Math.min(remaining, encoded.byteLength); length >= Math.max(0, remaining - 3); length -= 1) {
      try {
        this.value += this.decoder.decode(encoded.subarray(0, length));
        this.bytes += length;
        return;
      } catch {
        // Try the previous UTF-8 boundary. A code point is at most four bytes.
      }
    }
  }
}
