import http from "node:http";

import { debug, error } from "../logger.js";
import type { ResponseStream } from "../types/aws-lambda.js";

const HEADERS = Symbol();

export class StreamingServerResponse extends http.ServerResponse {
  [HEADERS]: Record<string, string> = {};
  responseStream: ResponseStream;
  fixHeaders: (headers: Record<string, string>) => void;
  onEnd: (headers: Record<string, string>) => Promise<void>;
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
      this._wroteHeader = true;
      // FIXME: This is extracted from the docker lambda node 18 runtime
      // https://gist.github.com/conico974/13afd708af20711b97df439b910ceb53#file-index-mjs-L921-L932
      // We replace their write with ours which are inside a process.nextTick
      // This way it seems to work all the time
      // I think we can't ship this code as it is, it could break at anytime if they decide to change the runtime and they already did it in the past
      this.responseStream.setContentType(
        "application/vnd.awslambda.http-integration-response",
      );
      const prelude = JSON.stringify({
        statusCode: statusCode as number,
        headers: this[HEADERS],
      });
      process.nextTick(() => {
        this.responseStream.write(prelude);
      });
      process.nextTick(() => {
        this.responseStream.write(new Uint8Array(8));
      });
      // this.responseStream = awslambda.HttpResponseStream.from(
      //   this.responseStream,
      //   {
      //     statusCode: statusCode as number,
      //     headers: this[HEADERS],
      //   },
      // );

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

    if (!this._hasWritten && !chunk) {
      // We need to send data here if there is none, otherwise the stream will not end at all
      this.internalWrite(new Uint8Array(8));
    }

    process.nextTick(() => {
      this.responseStream.end(async () => {
        // The callback seems necessary here
        debug("stream end", chunk);
        await this.onEnd(this[HEADERS]);
      });
    });
    // debug("stream end", chunk);
    return this;
  }

  private internalWrite(chunk: any) {
    process.nextTick(() => {
      this.responseStream.write(chunk);
      this._hasWritten = true;
    });
  }

  constructor(
    { method, headers }: { method?: string; headers?: Record<string, string> },
    responseStream: ResponseStream,
    fixHeaders: (headers: Record<string, string>) => void,
    onEnd: (headers: Record<string, string>) => Promise<void>,
  ) {
    //@ts-ignore
    super({ method });

    this[HEADERS] = headers || {};

    this.fixHeaders = fixHeaders;
    this.onEnd = onEnd;
    this.responseStream = responseStream;

    this.useChunkedEncodingByDefault = false;
    this.chunkedEncoding = false;

    this.assignSocket({
      _writableState: {},
      writable: true,
      // @ts-ignore
      on: this.responseStream.on.bind(this.responseStream),
      // @ts-ignore
      removeListener: this.responseStream.removeListener.bind(
        this.responseStream,
      ),
      // @ts-ignore
      destroy: this.responseStream.destroy.bind(this.responseStream),
      // @ts-ignore
      cork: this.responseStream.cork.bind(this.responseStream),
      // @ts-ignore
      uncork: this.responseStream.uncork.bind(this.responseStream),
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
      error("error", err);
      this.responseStream.end();
    });
  }
}
