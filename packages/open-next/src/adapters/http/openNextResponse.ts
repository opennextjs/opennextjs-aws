import { OutgoingHttpHeader, OutgoingHttpHeaders } from "http";
import { Transform, TransformCallback } from "stream";

import { ResponseStream } from "./responseStreaming";
import { parseHeaders } from "./util";

// We only need to implement the methods that are used by next.js
export class OpenNextNodeResponse extends Transform {
  statusCode: number | undefined;
  statusMessage: string | undefined;
  headers: OutgoingHttpHeaders = {};
  headersSent: boolean = false;
  _chunks: Buffer[] = [];

  constructor(
    private fixHeaders: (headers: OutgoingHttpHeaders) => void,
    onEnd: (headers: OutgoingHttpHeaders) => Promise<void>,
    private responseStream?: ResponseStream,
    private initialHeaders?: OutgoingHttpHeaders,
  ) {
    super();
    this.once("finish", () => {
      onEnd(this.headers);
    });
  }

  get finished() {
    return this.writableFinished && this.responseStream?.writableFinished;
  }

  setHeader(name: string, value: string | string[]): this {
    this.headers[name.toLowerCase()] = value;
    return this;
  }

  removeHeader(name: string): this {
    delete this.headers[name.toLowerCase()];
    return this;
  }

  hasHeader(name: string): boolean {
    return this.headers[name.toLowerCase()] !== undefined;
  }

  getHeaders(): OutgoingHttpHeaders {
    return this.headers;
  }

  getHeader(name: string): OutgoingHttpHeader | undefined {
    return this.headers[name.toLowerCase()];
  }

  // Only used directly in next@14+
  flushHeaders() {
    this.headersSent = true;
    if (this.initialHeaders) {
      this.headers = { ...this.headers, ...this.initialHeaders };
    }
    this.fixHeaders(this.headers);

    if (this.responseStream) {
      this.responseStream?.writeHeaders(
        {
          statusCode: this.statusCode ?? 200,
          cookies: [],
          headers: parseHeaders(this.headers),
        },
        () => {},
      );
      this.pipe(this.responseStream);
    }
  }

  // Might be used in next page api routes
  writeHead(statusCode: number, headers?: OutgoingHttpHeaders): this {
    this.statusCode = statusCode;
    if (headers) {
      this.headers = headers;
    }
    this.flushHeaders();
    return this;
  }

  get body() {
    return Buffer.concat(this._chunks);
  }

  private _internalWrite(chunk: any, encoding: BufferEncoding) {
    this._chunks.push(Buffer.from(chunk, encoding));
    this.push(chunk, encoding);
  }

  _transform(
    chunk: any,
    encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    if (!this.headersSent) {
      this.flushHeaders();
    }
    this._internalWrite(chunk, encoding);
    callback();
  }
}
