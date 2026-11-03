import type { ServerResponse } from "node:http";
import { Transform, type TransformCallback, type Writable } from "node:stream";

import { error } from "../adapters/logger";

/**
 * Largest `content-length` that is verified by buffering the body.
 *
 * It matches the largest response compressed by CloudFront, which only compresses responses with a `content-length`.
 * Larger responses are streamed without `content-length`.
 */
export const MAX_VERIFIED_CONTENT_LENGTH = 10_000_000;

/**
 * Writes the head of a Node.js `ServerResponse` and returns the stream to write the body to.
 *
 * The framing headers set by the app may not match the body that is actually written (e.g. a `fetch()` response
 * body is decoded but keeps the upstream `content-length`). The bytes past a stale `content-length` would stay on
 * the keep-alive connection and be read as the next response.
 *
 * - `transfer-encoding` is always removed, Node.js picks the transfer coding.
 * - A `content-length` that is not a valid length is removed.
 * - `content-length` is kept for HEAD requests and 304 responses, Node.js does not write a body for them.
 * - Otherwise `content-length` is only kept when the body has exactly the declared length. The body is buffered
 *   until this is known, and the head is written then, so the first byte is only sent once the whole body is
 *   received. When the length doesn't match, or is larger than `MAX_VERIFIED_CONTENT_LENGTH`, `content-length` is
 *   removed and Node.js frames the body itself (chunked on HTTP/1.1).
 *
 * The status code and the headers are always validated synchronously, even when the head is written later.
 *
 * @param res The Node.js response.
 * @param method The request method.
 * @param statusCode The response status code.
 * @param headers The response headers, keys are matched case-insensitively.
 * @returns The stream to write the body to.
 * @throws When the status code or a header is invalid, or the headers were already sent (same errors as
 *   `res.writeHead()`).
 */
export function writeResponseHead(
  res: ServerResponse,
  method: string | undefined,
  statusCode: number,
  headers: Record<string, string>,
): Writable {
  validateHead(res, statusCode);

  let contentLength: string | undefined;
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === "content-length") {
      contentLength = value;
    } else if (lowerKey !== "transfer-encoding") {
      // `setHeader()` validates the header like `writeHead()` does
      res.setHeader(key, value);
    }
  }

  const expectedLength = parseContentLength(contentLength);

  if (
    !Number.isNaN(expectedLength) &&
    (method?.toUpperCase() === "HEAD" || statusCode === 304)
  ) {
    res.setHeader("content-length", String(expectedLength));
    res.writeHead(statusCode);
    res.flushHeaders();
    return res;
  }

  if (statusCode === 204 || !(expectedLength <= MAX_VERIFIED_CONTENT_LENGTH)) {
    res.writeHead(statusCode);
    res.flushHeaders();
    return res;
  }

  const body = new ContentLengthVerifier(res, statusCode, expectedLength);
  body.pipe(res);
  return body;
}

/**
 * Checks that the head can be written, the way `res.writeHead()` does.
 *
 * The headers are validated by `res.setHeader()`.
 *
 * @param res The Node.js response.
 * @param statusCode The response status code.
 * @throws {Error} When the headers were already sent (code `ERR_HTTP_HEADERS_SENT`).
 * @throws {RangeError} When the status code is not in 100-999 (code `ERR_HTTP_INVALID_STATUS_CODE`).
 */
function validateHead(res: ServerResponse, statusCode: number) {
  if (res.headersSent) {
    throw Object.assign(
      new Error("Cannot write headers after they are sent to the client"),
      { code: "ERR_HTTP_HEADERS_SENT" },
    );
  }
  const code = statusCode | 0;
  if (code < 100 || code > 999) {
    throw Object.assign(new RangeError(`Invalid status code: ${statusCode}`), {
      code: "ERR_HTTP_INVALID_STATUS_CODE",
    });
  }
}

/**
 * Parses a `content-length` header value.
 *
 * @param contentLength The header value.
 * @returns The length, or `NaN` when the value is missing or not a valid length.
 */
function parseContentLength(contentLength: string | undefined): number {
  const value = contentLength?.trim() ?? "";
  const length = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  return Number.isSafeInteger(length) ? length : Number.NaN;
}

/**
 * Buffers the body until it is known whether it has the declared length, then writes the head and the body.
 *
 * The headers, other than `content-length`, are already set on the response.
 */
class ContentLengthVerifier extends Transform {
  private chunks: Buffer[] = [];
  private length = 0;
  private headWritten = false;

  /**
   * @param res The Node.js response.
   * @param statusCode The response status code, already validated.
   * @param expectedLength The declared `content-length`.
   */
  constructor(
    private res: ServerResponse,
    private statusCode: number,
    private expectedLength: number,
  ) {
    super();
  }

  /**
   * Buffers the chunk until the head is written, then passes it through.
   *
   * The head is written without `content-length` as soon as the body is longer than declared.
   *
   * @param chunk The body chunk.
   * @param _encoding Unused, chunks are buffers.
   * @param callback Called once the chunk is processed.
   */
  _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    if (this.headWritten) {
      callback(null, chunk);
      return;
    }
    this.chunks.push(chunk);
    this.length += chunk.length;
    if (this.length > this.expectedLength) {
      this.writeHead(false);
    }
    callback();
  }

  /**
   * Writes the head, when not already written, once the whole body is received.
   *
   * @param callback Called once the head and the buffered chunks are written.
   */
  _flush(callback: TransformCallback): void {
    if (!this.headWritten) {
      this.writeHead(this.length === this.expectedLength);
    }
    callback();
  }

  /**
   * Writes the head and the buffered chunks.
   *
   * This runs from the stream callbacks, where a thrown error would be uncaught and crash the process. The
   * head is validated synchronously in `writeResponseHead()`, if writing it still fails, the response is destroyed.
   *
   * @param keepContentLength Whether the body has the declared length.
   */
  private writeHead(keepContentLength: boolean) {
    this.headWritten = true;
    const chunks = this.chunks;
    this.chunks = [];
    try {
      if (keepContentLength) {
        this.res.setHeader("content-length", String(this.expectedLength));
      }
      this.res.writeHead(this.statusCode);
    } catch (e) {
      error("Failed to write the response head", e);
      this.res.destroy();
      // Without an error, no `error` event is emitted
      this.destroy();
      return;
    }
    for (const chunk of chunks) {
      this.push(chunk);
    }
  }
}
