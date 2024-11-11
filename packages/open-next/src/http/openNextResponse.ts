import type {
  IncomingMessage,
  OutgoingHttpHeader,
  OutgoingHttpHeaders,
  ServerResponse,
} from "http";
import type { Socket } from "net";
import type { TransformCallback, Writable } from "stream";
import { Transform } from "stream";

import { debug } from "../adapters/logger";
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
  onFinish: (length: number) => void;
}

// We only need to implement the methods that are used by next.js
export class OpenNextNodeResponse extends Transform implements ServerResponse {
  statusCode!: number;
  statusMessage = "";
  headers: OutgoingHttpHeaders = {};
  private _cookies: string[] = [];
  private responseStream?: Writable;
  headersSent = false;
  _chunks: Buffer[] = [];

  // To comply with the ServerResponse interface :
  strictContentLength = false;
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
  chunkedEncoding = false;
  shouldKeepAlive = true;
  useChunkedEncodingByDefault = true;
  sendDate = false;
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
    this.once("finish", () => {
      if (!this.headersSent) {
        this.flushHeaders();
      }
      // In some cases we might not have a store i.e. for example in the image optimization function
      // We may want to reconsider this in the future, it might be intersting to have access to this store everywhere
      globalThis.__openNextAls
        ?.getStore()
        ?.pendingPromiseRunner.add(onEnd(this.headers));
      const bodyLength = this.getBody().length;
      this.streamCreator?.onFinish(bodyLength);
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
    const mergeHeadersPriority =
      globalThis.__openNextAls?.getStore()?.mergeHeadersPriority ??
      "middleware";
    if (this.initialHeaders) {
      this.headers =
        mergeHeadersPriority === "middleware"
          ? {
              ...this.headers,
              ...this.initialHeaders,
            }
          : {
              ...this.initialHeaders,
              ...this.headers,
            };
      const initialCookies = parseCookies(
        this.initialHeaders[SET_COOKIE_HEADER],
      );
      this._cookies =
        mergeHeadersPriority === "middleware"
          ? [...this._cookies, ...initialCookies]
          : [...initialCookies, ...this._cookies];
    }
    this.fixHeaders(this.headers);
    this.fixHeadersForError();

    // We need to fix the set-cookie header here
    this.headers[SET_COOKIE_HEADER] = this._cookies;

    const parsedHeaders = parseHeaders(this.headers);

    // We need to remove the set-cookie header from the parsed headers because
    // it does not handle multiple set-cookie headers properly
    delete parsedHeaders[SET_COOKIE_HEADER];

    if (this.streamCreator) {
      this.responseStream = this.streamCreator?.writeHeaders({
        statusCode: this.statusCode ?? 200,
        cookies: this._cookies,
        headers: parsedHeaders,
      });
      this.pipe(this.responseStream);
    }
  }

  appendHeader(name: string, value: string | string[]): this {
    const key = name.toLowerCase();
    if (!this.hasHeader(key)) {
      return this.setHeader(key, value);
    }
    const existingHeader = this.getHeader(key) as string | string[];
    const toAppend = Array.isArray(value) ? value : [value];
    const newValue = Array.isArray(existingHeader)
      ? [...existingHeader, ...toAppend]
      : [existingHeader, ...toAppend];
    return this.setHeader(key, newValue);
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

  /**
   * OpenNext specific method
   */

  getFixedHeaders(): OutgoingHttpHeaders {
    // Do we want to apply this on writeHead?
    this.fixHeaders(this.headers);
    this.fixHeadersForError();
    // This way we ensure that the cookies are correct
    this.headers[SET_COOKIE_HEADER] = this._cookies;
    return this.headers;
  }

  getBody() {
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

  //This is only here because of aws broken streaming implementation.
  //Hopefully one day they will be able to give us a working streaming implementation in lambda for everyone
  //If you're lucky you have a working streaming implementation in your aws account and don't need this
  //If not you can set the OPEN_NEXT_FORCE_NON_EMPTY_RESPONSE env variable to true
  //BE CAREFUL: Aws keeps rolling out broken streaming implementations even on accounts that had working ones before
  //This is not dependent on the node runtime used
  //There is another known issue with aws lambda streaming where the request reach the lambda only way after the request has been sent by the client. For this there is absolutely nothing we can do, contact aws support if that's your case
  _flush(callback: TransformCallback): void {
    if (
      this.getBody().length < 1 &&
      // We use an env variable here because not all aws account have the same behavior
      // On some aws accounts the response will hang if the body is empty
      // We are modifying the response body here, this is not a good practice
      process.env.OPEN_NEXT_FORCE_NON_EMPTY_RESPONSE === "true"
    ) {
      debug('Force writing "SOMETHING" to the response body');
      this.push("SOMETHING");
    }
    callback();
  }

  /**
   * New method in Node 18.15+
   * There are probably not used right now in Next.js, but better be safe than sorry
   */

  setHeaders(
    headers: Headers | Map<string, number | string | readonly string[]>,
  ): this {
    headers.forEach((value, key) => {
      this.setHeader(key, Array.isArray(value) ? value : value.toString());
    });
    return this;
  }

  /**
   * Next specific methods
   * On earlier versions of next.js, those methods are mandatory to make everything work
   */

  get sent() {
    return this.finished || this.headersSent;
  }

  getHeaderValues(name: string): string[] | undefined {
    const values = this.getHeader(name);

    if (values === undefined) return undefined;

    return (Array.isArray(values) ? values : [values]).map((value) =>
      value.toString(),
    );
  }

  send() {
    const body = this.getBody();
    this.end(body);
  }

  body(value: string) {
    this.write(value);
    return this;
  }

  onClose(callback: () => void) {
    this.on("close", callback);
  }

  redirect(destination: string, statusCode: number) {
    this.setHeader("Location", destination);
    this.statusCode = statusCode;

    // Since IE11 doesn't support the 308 header add backwards
    // compatibility using refresh header
    if (statusCode === 308) {
      this.setHeader("Refresh", `0;url=${destination}`);
    }

    //TODO: test to see if we need to call end here
    return this;
  }

  // For some reason, next returns the 500 error page with some cache-control headers
  // We need to fix that
  private fixHeadersForError() {
    if (process.env.OPEN_NEXT_DANGEROUSLY_SET_ERROR_HEADERS === "true") {
      return;
    }
    // We only check for 404 and 500 errors
    // The rest should be errors that are handled by the user and they should set the cache headers themselves
    if (this.statusCode === 404 || this.statusCode === 500) {
      // For some reason calling this.setHeader("Cache-Control", "no-cache, no-store, must-revalidate") does not work here
      // The function is not even called, i'm probably missing something obvious
      this.headers["cache-control"] =
        "private, no-cache, no-store, max-age=0, must-revalidate";
    }
  }
}
