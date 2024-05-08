import type {
  IncomingMessage,
  OutgoingHttpHeader,
  OutgoingHttpHeaders,
  ServerResponse,
} from "http";
import { Socket } from "net";
import { Transform, TransformCallback, Writable } from "stream";

import { parseCookies, parseHeaders } from "./util";

const SET_COOKIE_HEADER = "set-cookie";
const CANNOT_BE_USED = "This cannot be used in OpenNext";

export interface StreamCreator {
  writeHeaders(prelude: {
    statusCode: number;
    cookies: string[];
    headers: Record<string, string>;
  }): Writable;
  // Just to fix an issue with aws lambda streaming with empty body
  onWrite?: () => void;
  onFinish: () => void;
}

// We only need to implement the methods that are used by next.js
export class OpenNextNodeResponse extends Transform implements ServerResponse {
  statusCode!: number;
  statusMessage: string = "";
  headers: OutgoingHttpHeaders = {};
  private _cookies: string[] = [];
  private responseStream?: Writable;
  headersSent: boolean = false;
  _chunks: Buffer[] = [];

  // To comply with the ServerResponse interface :
  strictContentLength: boolean = false;
  assignSocket(_socket: Socket): void {
    throw new Error(CANNOT_BE_USED);
  }
  detachSocket(_socket: Socket): void {
    throw new Error(CANNOT_BE_USED);
  }
  // We might have to revisit those 3 in the future
  writeContinue(_callback?: (() => void) | undefined): void {
    throw new Error(CANNOT_BE_USED);
  }
  writeEarlyHints(
    _hints: Record<string, string | string[]>,
    _callback?: (() => void) | undefined,
  ): void {
    throw new Error(CANNOT_BE_USED);
  }
  writeProcessing(): void {
    throw new Error(CANNOT_BE_USED);
  }
  /**
   * This is a dummy request object to comply with the ServerResponse interface
   * It will never be defined
   */
  req!: IncomingMessage;
  chunkedEncoding: boolean = false;
  shouldKeepAlive: boolean = true;
  useChunkedEncodingByDefault: boolean = true;
  sendDate: boolean = false;
  connection: Socket | null = null;
  socket: Socket | null = null;
  setTimeout(_msecs: number, _callback?: (() => void) | undefined): this {
    throw new Error(CANNOT_BE_USED);
  }
  addTrailers(
    _headers: OutgoingHttpHeaders | readonly [string, string][],
  ): void {
    throw new Error(CANNOT_BE_USED);
  }

  constructor(
    private fixHeaders: (headers: OutgoingHttpHeaders) => void,
    onEnd: (headers: OutgoingHttpHeaders) => Promise<void>,
    private streamCreator?: StreamCreator,
    private initialHeaders?: OutgoingHttpHeaders,
  ) {
    super();
    if (initialHeaders && initialHeaders[SET_COOKIE_HEADER]) {
      this._cookies = parseCookies(
        initialHeaders[SET_COOKIE_HEADER] as string | string[],
      ) as string[];
    }
    this.once("finish", () => {
      if (!this.headersSent) {
        this.flushHeaders();
      }
      onEnd(this.headers);
      this.streamCreator?.onFinish();
    });
  }

  // Necessary for next 12
  // We might have to implement all the methods here
  get originalResponse() {
    return this;
  }

  get finished() {
    return Boolean(
      this.writableFinished && this.responseStream?.writableFinished,
    );
  }

  setHeader(name: string, value: string | string[]): this {
    const key = name.toLowerCase();
    if (key === SET_COOKIE_HEADER) {
      if (Array.isArray(value)) {
        this._cookies = value;
      } else {
        this._cookies = [value];
      }
    }
    // We should always replace the header
    // See https://nodejs.org/docs/latest-v18.x/api/http.html#responsesetheadername-value
    this.headers[key] = value;

    return this;
  }

  removeHeader(name: string): this {
    const key = name.toLowerCase();
    if (key === SET_COOKIE_HEADER) {
      this._cookies = [];
    } else {
      delete this.headers[key];
    }
    return this;
  }

  hasHeader(name: string): boolean {
    const key = name.toLowerCase();
    if (key === SET_COOKIE_HEADER) {
      return this._cookies.length > 0;
    }
    return this.headers[key] !== undefined;
  }

  getHeaders(): OutgoingHttpHeaders {
    return this.headers;
  }

  getFixedHeaders(): OutgoingHttpHeaders {
    // Do we want to apply this on writeHead?
    this.fixHeaders(this.headers);
    return this.headers;
  }

  getHeader(name: string): OutgoingHttpHeader | undefined {
    return this.headers[name.toLowerCase()];
  }

  getHeaderNames(): string[] {
    return Object.keys(this.headers);
  }

  // Only used directly in next@14+
  flushHeaders() {
    this.headersSent = true;
    // Initial headers should be merged with the new headers
    // These initial headers are the one created either in the middleware or in next.config.js
    // We choose to override response headers with middleware headers
    // This is different than the default behavior in next.js, but it allows more customization
    // TODO: We probably want to change this behavior in the future to follow next
    // We could add a prefix header that would allow to force the middleware headers
    // Something like open-next-force-cache-control would override the cache-control header
    if (this.initialHeaders) {
      this.headers = {
        ...this.headers,
        ...this.initialHeaders,
      };
    }
    this.fixHeaders(this.headers);
    if (this._cookies.length > 0) {
      // For cookies we cannot do the same as for other headers
      // We need to merge the cookies, and in this case, cookies generated by the routes or pages
      // should be added after the ones generated by the middleware
      // This prevents the middleware from overriding the cookies, especially for server actions
      // which uses the same pathnames as the pages they're being called on
      this.headers[SET_COOKIE_HEADER] = [
        ...(parseCookies(
          this.initialHeaders?.[SET_COOKIE_HEADER] as string | string[],
        ) ?? []),
        ...this._cookies,
      ];
    }

    if (this.streamCreator) {
      this.responseStream = this.streamCreator?.writeHeaders({
        statusCode: this.statusCode ?? 200,
        cookies: this._cookies,
        headers: parseHeaders(this.headers),
      });
      this.pipe(this.responseStream);
    }
  }

  appendHeader(name: string, value: string | string[]): this {
    const key = name.toLowerCase();
    if (!this.hasHeader(key)) {
      return this.setHeader(key, value);
    } else {
      const existingHeader = this.getHeader(key) as string | string[];
      const toAppend = Array.isArray(value) ? value : [value];
      const newValue = Array.isArray(existingHeader)
        ? [...existingHeader, ...toAppend]
        : [existingHeader, ...toAppend];
      return this.setHeader(key, newValue);
    }
  }

  // Might be used in next page api routes
  writeHead(
    statusCode: number,
    statusMessage?: string | undefined,
    headers?: OutgoingHttpHeaders | OutgoingHttpHeader[] | undefined,
  ): this;
  writeHead(
    statusCode: number,
    headers?: OutgoingHttpHeaders | OutgoingHttpHeader[] | undefined,
  ): this;
  writeHead(
    statusCode: unknown,
    statusMessage?: unknown,
    headers?: unknown,
  ): this {
    let _headers = headers as
      | OutgoingHttpHeaders
      | OutgoingHttpHeader[]
      | undefined;
    let _statusMessage: string | undefined;
    if (typeof statusMessage === "string") {
      _statusMessage = statusMessage;
    } else {
      _headers = statusMessage as
        | OutgoingHttpHeaders
        | OutgoingHttpHeader[]
        | undefined;
    }
    const finalHeaders: OutgoingHttpHeaders = this.headers;
    if (_headers) {
      if (Array.isArray(_headers)) {
        // headers may be an Array where the keys and values are in the same list. It is not a list of tuples. So, the even-numbered offsets are key values, and the odd-numbered offsets are the associated values.
        for (let i = 0; i < _headers.length; i += 2) {
          finalHeaders[_headers[i] as string] = _headers[i + 1] as
            | string
            | string[];
        }
      } else {
        for (const key of Object.keys(_headers)) {
          finalHeaders[key] = _headers[key];
        }
      }
    }

    this.statusCode = statusCode as number;
    if (headers) {
      this.headers = finalHeaders;
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
    this.streamCreator?.onWrite?.();
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
