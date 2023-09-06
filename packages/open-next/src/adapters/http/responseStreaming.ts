import http from "node:http";
import { Socket } from "node:net";

import { debug, error } from "../logger.js";
import type { ResponseStream } from "../types/aws-lambda.js";
import { convertHeader, NO_OP, parseHeaders } from "./util.js";

const HEADERS = Symbol();

export interface StreamingServerResponseProps {
  method?: string;
  headers?: Record<string, string>;
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

  constructor({
    method,
    headers,
    responseStream,
    fixHeaders,
    onEnd,
  }: StreamingServerResponseProps) {
    super({ method } as any);

    this[HEADERS] = headers || {};

    this.fixHeaders = fixHeaders;
    this.onEnd = onEnd;
    this.responseStream = responseStream;

    this.useChunkedEncodingByDefault = false;
    this.chunkedEncoding = false;

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

        this.internalWrite(data);

        if (typeof cb === "function") {
          cb();
        }
        return true;
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

  setHeader(name: string, value: string | number | string[]): this {
    this[HEADERS][name.toLowerCase()] = convertHeader(value);
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
        headers: this[HEADERS],
      });
      setImmediate(() => {
        this.responseStream.write(prelude);
      });
      setImmediate(() => {
        this.responseStream.write(new Uint8Array(8));
      });
      // This is the way we should do it but it doesn't work everytime for some reasons
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
    if (chunk && typeof chunk !== "function") {
      this.internalWrite(chunk);
    }
    if (!this._hasWritten && !chunk) {
      // We need to send data here if there is none, otherwise the stream will not end at all
      this.internalWrite(new Uint8Array(8));
    }

    setImmediate(() => {
      this.responseStream.end(async () => {
        debug("stream end", chunk);
        await this.onEnd(this[HEADERS]);
        cb?.();
      });
    });
    return this;
  }

  private internalWrite(chunk: any) {
    this._hasWritten = true;
    setImmediate(() => {
      if (this.responseStream.writableNeedDrain) {
        debug("drain");
        this.responseStream.once("drain", () => {
          this.internalWrite(chunk);
        });
      } else {
        this.responseStream.write(chunk);
      }
    });
  }

  cancel(error?: Error) {
    debug("cancel", error);
    this.responseStream.off("close", this.cancel.bind(this));
    this.responseStream.off("error", this.cancel.bind(this));

    if (error) {
      this.responseStream.destroy(error);
    }
  }
}
