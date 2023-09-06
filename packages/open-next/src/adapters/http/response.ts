// Copied and modified from serverless-http by Doug Moscrop
// https://github.com/dougmoscrop/serverless-http/blob/master/lib/response.js
// Licensed under the MIT License

import http from "node:http";
import { Socket } from "node:net";

import {
  convertHeader,
  getString,
  headerEnd,
  NO_OP,
  parseHeaders,
} from "./util.js";

const BODY = Symbol();
const HEADERS = Symbol();

function addData(stream: ServerlessResponse, data: Uint8Array | string) {
  if (
    Buffer.isBuffer(data) ||
    ArrayBuffer.isView(data) ||
    typeof data === "string"
  ) {
    stream[BODY].push(Buffer.from(data));
  } else {
    throw new Error(`response.addData() of unexpected type: ${typeof data}`);
  }
}

export interface ServerlessResponseProps {
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

export class ServerlessResponse extends http.ServerResponse {
  [BODY]: Buffer[];
  [HEADERS]: Record<string, string>;
  private _wroteHeader = false;
  private _header = "";

  constructor({ method, headers }: ServerlessResponseProps) {
    super({ method, headers } as any);

    this[BODY] = [];
    this[HEADERS] = parseHeaders(headers) || {};

    this.useChunkedEncodingByDefault = false;
    this.chunkedEncoding = false;
    this._header = "";

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
          encoding = null;
        }

        if (this._header === "" || this._wroteHeader) {
          addData(this, data);
        } else {
          const string = getString(data);
          const index = string.indexOf(headerEnd);

          if (index !== -1) {
            const remainder = string.slice(index + headerEnd.length);

            if (remainder) {
              addData(this, remainder);
            }

            this._wroteHeader = true;
          }
        }

        if (typeof cb === "function") {
          cb();
        }
        return true;
      },
    };

    this.assignSocket(socket as Socket);

    this.once("finish", () => {
      this.emit("close");
    });
  }

  static body(res: ServerlessResponse) {
    return Buffer.concat(res[BODY]);
  }

  static headers(res: ServerlessResponse) {
    const headers =
      typeof res.getHeaders === "function" ? res.getHeaders() : res[HEADERS];

    return Object.assign(headers, res[HEADERS]);
  }

  get headers() {
    return this[HEADERS];
  }

  setHeader(key: string, value: string | number | string[]): this {
    if (this._wroteHeader) {
      this[HEADERS][key] = convertHeader(value);
    } else {
      super.setHeader(key, value);
    }
    return this;
  }

  writeHead(
    statusCode: number,
    reason?: string | any | any[],
    obj?: any | any[],
  ) {
    const headers = typeof reason === "string" ? obj : reason;

    for (const name in headers) {
      this.setHeader(name, headers[name]);

      if (!this._wroteHeader) {
        // we only need to initiate super.headers once
        // writeHead will add the other headers itself
        break;
      }
    }

    return super.writeHead(statusCode, reason, obj);
  }
}
