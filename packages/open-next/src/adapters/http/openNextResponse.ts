import { OutgoingHttpHeader, OutgoingHttpHeaders } from "http";
import { Writable } from "stream";

import { ResponseStream } from "./responseStreaming";
import { parseHeaders } from "./util";

// We only need to implement the methods that are used by next.js
export class OpenNextNodeResponse extends Writable {
  statusCode: number | undefined;
  statusMessage: string | undefined;
  headers: OutgoingHttpHeaders = {};
  headersSent: boolean = false;
  _chunks: Buffer[] = [];

  constructor(
    private fixHeaders: (headers: OutgoingHttpHeaders) => void,
    private onEnd: (headers: OutgoingHttpHeaders) => Promise<void>,
    private responseStream?: ResponseStream,
    private initialHeaders?: OutgoingHttpHeaders,
  ) {
    super();
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
    this.responseStream?.writeHeaders(
      {
        statusCode: this.statusCode ?? 200,
        cookies: [],
        headers: parseHeaders(this.headers),
      },
      () => {},
    );
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
    return this.responseStream?.write(chunk, encoding);
  }

  _write(
    chunk: any,
    encoding: BufferEncoding,
    callback: (error?: Error | null | undefined) => void,
  ): void {
    if (!this.headersSent) {
      this.flushHeaders();
    }
    this._internalWrite(chunk, encoding);
    callback();
  }

  end(cb?: (() => void) | undefined): this;
  end(chunk: any, cb?: (() => void) | undefined): this;
  end(
    chunk: any,
    encoding: BufferEncoding,
    cb?: (() => void) | undefined,
  ): this;
  end(chunk?: unknown, encoding?: unknown, cb?: unknown): this {
    this.onEnd(parseHeaders(this.headers));
    if (!this.headersSent) {
      this.flushHeaders();
    }
    if (!chunk) {
      this.responseStream?.end();
      return this;
    }
    if (typeof chunk === "function") {
      chunk();
    } else if (typeof encoding === "function") {
      this._internalWrite(chunk, "utf8");
      encoding();
    } else {
      this._internalWrite(chunk, encoding as BufferEncoding);
      //@ts-expect-error - typescript doesn't infer that cb is a function
      cb?.();
    }
    this.responseStream?.end();
    return this;
  }
}
