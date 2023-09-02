import http from "node:http";

import { debug, error } from "../logger.js";
import type { ResponseStream } from "../types/aws-lambda.js";

const HEADERS = Symbol();

export class StreamingServerResponse extends http.ServerResponse {
  [HEADERS]: Record<string, string> = {};
  responseStream: ResponseStream;
  fixHeaders: (headers: Record<string, string>) => void;
  private _wroteHeader = false;
  private _hasWritten = false;

  get headers() {
    return this[HEADERS];
  }

  setHeader(name: string, value: string | number | readonly string[]): this {
    // @ts-ignore
    this[HEADERS][name.toLowerCase()] = value;
    return this;
  }

  writeHead(
    statusCode: number,
    statusMessage?: string | undefined,
    headers?: http.OutgoingHttpHeaders | http.OutgoingHttpHeader[] | undefined,
  ): this;
  writeHead(
    statusCode: number,
    headers?: http.OutgoingHttpHeaders | http.OutgoingHttpHeader[] | undefined,
  ): this;
  writeHead(
    statusCode: unknown,
    statusMessage?: unknown,
    headers?: unknown,
  ): this {
    if (this._wroteHeader) {
      return this;
    }
    try {
      this.fixHeaders(this[HEADERS]);
      this.responseStream = awslambda.HttpResponseStream.from(
        this.responseStream,
        {
          statusCode: statusCode as number,
          headers: this[HEADERS],
        },
      );

      this._wroteHeader = true;
      debug("writeHead", this[HEADERS]);
    } catch (e) {
      this.responseStream.end();
      error(e);
    }

    return this;
  }

  end(cb?: (() => void) | undefined): this;
  end(chunk: any, cb?: (() => void) | undefined): this;
  end(
    chunk: any,
    encoding: BufferEncoding,
    cb?: (() => void) | undefined,
  ): this;
  end(chunk?: unknown, encoding?: unknown, cb?: unknown): this {
    if (!this._wroteHeader) {
      // When next directly returns with end, the writeHead is not called,
      // so we need to call it here
      this.writeHead(this.statusCode ?? 200);
    }
    if (chunk && typeof chunk !== "function") {
      this.internalWrite(chunk);
    }

    setImmediate(() => {
      if (!this._hasWritten) {
        // We need to send data here, otherwise the stream will not end at all
        this.internalWrite(new Uint8Array(8));
      }
      this.responseStream.end();
    });
    debug("stream end", chunk);
    return this;
  }

  private internalWrite(chunk: any) {
    setImmediate(() => {
      this.responseStream.write(chunk);
      this._hasWritten = true;
    });
  }

  constructor(
    { method, headers }: { method?: string; headers?: Record<string, string> },
    responseStream: ResponseStream,
    fixHeaders: (headers: Record<string, string>) => void,
  ) {
    //@ts-ignore
    super({ method });

    this[HEADERS] = headers || {};

    this.fixHeaders = fixHeaders;
    this.responseStream = responseStream;

    this.useChunkedEncodingByDefault = false;
    this.chunkedEncoding = false;

    this.assignSocket({
      _writableState: {},
      writable: true,
      // @ts-ignore
      on: Function.prototype,
      // @ts-ignore
      removeListener: Function.prototype,
      // @ts-ignore
      destroy: Function.prototype,
      // @ts-ignore
      cork: Function.prototype,
      // @ts-ignore
      uncork: Function.prototype,
      // @ts-ignore
      write: (data, encoding, cb) => {
        if (typeof encoding === "function") {
          cb = encoding;
          encoding = undefined;
        }

        this.internalWrite(data);

        if (typeof cb === "function") {
          cb();
        }
        return true;
      },
    });

    this.responseStream.on("error", (err) => {
      this.emit("error", err);
      this.responseStream.end();
      error("error", err);
    });
  }
}
