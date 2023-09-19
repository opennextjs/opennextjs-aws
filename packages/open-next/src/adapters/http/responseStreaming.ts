import http from "node:http";
import { Socket } from "node:net";
import zlib from "node:zlib";

import { debug, error } from "../logger.js";
import type { ResponseStream } from "../types/aws-lambda.js";
import { convertHeader, getString, NO_OP, parseHeaders } from "./util.js";

const HEADERS = Symbol();

export interface StreamingServerResponseProps {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  responseStream: ResponseStream;
  fixHeaders: (headers: Record<string, string>) => void;
  onEnd: (headers: Record<string, string>) => Promise<void>;
}
export class StreamingServerResponse extends http.ServerResponse {
  [HEADERS]: Record<string, string> = {};
  responseStream: ResponseStream;
  fixHeaders: (headers: Record<string, string>) => void;
  onEnd: (headers: Record<string, string>) => Promise<void>;
  private _wroteHeader = false;
  private _hasWritten = false;
  private _initialHeaders: Record<string, string> = {};
  private _cookies: string[] = [];
  private _compressed = false;

  constructor({
    method,
    headers,
    responseStream,
    fixHeaders,
    onEnd,
  }: StreamingServerResponseProps) {
    super({ method } as any);

    this[HEADERS] = parseHeaders(headers) || {};
    this._initialHeaders = { ...this[HEADERS] };

    this.fixHeaders = fixHeaders;
    this.onEnd = onEnd;
    this.responseStream = responseStream;

    this.useChunkedEncodingByDefault = false;
    this.chunkedEncoding = false;

    this.responseStream.cork();

    const socket: Partial<Socket> & { _writableState: any } = {
      _writableState: {},
      writable: true,
      on: NO_OP,
      removeListener: NO_OP,
      destroy: NO_OP,
      cork: NO_OP,
      uncork: NO_OP,
      write: (
        data: Uint8Array | string,
        encoding?: string | null | (() => void),
        cb?: () => void,
      ) => {
        if (typeof encoding === "function") {
          cb = encoding;
          encoding = undefined;
        }
        const d = getString(data);
        const isSse = d.endsWith("\n\n");
        this.internalWrite(data, isSse, cb);

        return this.responseStream.writableNeedDrain;
      },
    };

    this.assignSocket(socket as Socket);

    this.responseStream.on("close", this.cancel.bind(this));
    this.responseStream.on("error", this.cancel.bind(this));

    this.on("close", this.cancel.bind(this));
    this.on("error", this.cancel.bind(this));
    this.once("finish", () => {
      this.emit("close");
    });
  }

  get headers() {
    return this[HEADERS];
  }

  setHeader(key: string, value: string | number | string[]): this {
    key = key.toLowerCase();
    // There can be multiple set-cookie response headers
    // They need to be returned as a special "cookies" array, eg:
    // {statusCode: xxx, cookies: ['Cookie=Yum'], ...}
    if (key === "set-cookie") {
      this._cookies.push(convertHeader(value));
    } else {
      this[HEADERS][key] = convertHeader(value);
    }
    return this;
  }

  writeHead(
    statusCode: number,
    _statusMessage?:
      | string
      | http.OutgoingHttpHeaders
      | http.OutgoingHttpHeader[],
    _headers?: http.OutgoingHttpHeaders | http.OutgoingHttpHeader[],
  ): this {
    const headers =
      typeof _statusMessage === "string" ? _headers : _statusMessage;
    const statusMessage =
      typeof _statusMessage === "string" ? _statusMessage : undefined;
    if (this._wroteHeader) {
      return this;
    }
    try {
      debug("writeHead", statusCode, statusMessage, headers);
      const parsedHeaders = parseHeaders(headers);
      this[HEADERS] = {
        ...this[HEADERS],
        ...parsedHeaders,
      };

      this.fixHeaders(this[HEADERS]);
      this[HEADERS] = {
        ...this[HEADERS],
        ...this._initialHeaders,
      };

      this._compressed = this[HEADERS]["accept-encoding"]?.includes("br");
      if (this._compressed) {
        this[HEADERS]["content-encoding"] = "br";
      }
      delete this[HEADERS]["accept-encoding"];

      debug("writeHead", this[HEADERS]);

      this._wroteHeader = true;
      // FIXME: This is extracted from the docker lambda node 18 runtime
      // https://gist.github.com/conico974/13afd708af20711b97df439b910ceb53#file-index-mjs-L921-L932
      // We replace their write with ours which are inside a setImmediate
      // This way it seems to work all the time
      // I think we can't ship this code as it is, it could break at anytime if they decide to change the runtime and they already did it in the past
      this.responseStream.setContentType(
        "application/vnd.awslambda.http-integration-response",
      );
      const prelude = JSON.stringify({
        statusCode: statusCode as number,
        cookies: this._cookies,
        headers: this[HEADERS],
      });

      // Try to flush the buffer to the client to invoke
      // the streaming. This does not work 100% of the time.
      setImmediate(() => {
        this.responseStream.write("\n\n");
        this.responseStream.uncork();
      });
      setImmediate(() => {
        this.responseStream.write(prelude);
      });

      setImmediate(() => {
        this.responseStream.write(new Uint8Array(8));

        // After headers are written, compress all writes
        // using Brotli
        if (this._compressed) {
          const br = zlib.createBrotliCompress({
            flush: zlib.constants.BROTLI_OPERATION_FLUSH,
          });
          br.setMaxListeners(100);
          br.pipe(this.responseStream);
          this.responseStream = br as unknown as ResponseStream;
        }
      });

      debug("writeHead", this[HEADERS]);
    } catch (e) {
      this.responseStream.end();
      error(e);
    }

    return this;
  }

  end(
    _chunk?: Uint8Array | string | (() => void),
    _encoding?: BufferEncoding | (() => void),
    _cb?: (() => void) | undefined,
  ): this {
    const chunk = typeof _chunk === "function" ? undefined : _chunk;
    const cb = typeof _cb === "function" ? _cb : undefined;

    if (!this._wroteHeader) {
      // When next directly returns with end, the writeHead is not called,
      // so we need to call it here
      this.writeHead(this.statusCode ?? 200);
    }

    if (!this._hasWritten && !chunk) {
      // We need to send data here if there is none, otherwise the stream will not end at all
      this.internalWrite(new Uint8Array(8), false, cb);
    }

    const _end = () => {
      setImmediate(() => {
        this.responseStream.end(_chunk, async () => {
          if (this._compressed) {
            (this.responseStream as unknown as zlib.BrotliCompress).flush(
              zlib.constants.BROTLI_OPERATION_FINISH,
            );
          }
          await this.onEnd(this[HEADERS]);
          cb?.();
        });
      });
    };

    if (this.responseStream.writableNeedDrain) {
      this.responseStream.once("drain", _end);
    } else {
      _end();
    }
    return this;
  }

  private internalWrite(chunk: any, isSse: boolean = false, cb?: () => void) {
    this._hasWritten = true;
    setImmediate(() => {
      this.responseStream.write(chunk, cb);
      // SSE need to flush to send to client ASAP
      if (isSse) {
        setImmediate(() => {
          this.responseStream.write("\n\n");
          this.responseStream.uncork();
        });
      }
    });
  }

  cancel(error?: Error) {
    this.responseStream.off("close", this.cancel.bind(this));
    this.responseStream.off("error", this.cancel.bind(this));

    if (error) {
      this.responseStream.destroy(error);
    }
  }
}
