// Copied and modified from serverless-http by Doug Moscrop
// https://github.com/dougmoscrop/serverless-http/blob/master/lib/response.js
// Licensed under the MIT License

// @ts-nocheck
import http from "node:http";

const headerEnd = "\r\n\r\n";

const BODY = Symbol();
const HEADERS = Symbol();

function getString(data) {
  // Note: use `ArrayBuffer.isView()` to check for Uint8Array. Using
  //       `instanceof Uint8Array` returns false in some cases. For example,
  //       when the buffer is created in middleware and passed to NextServer.
  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  } else if (ArrayBuffer.isView(data)) {
    return Buffer.from(data).toString("utf8");
  } else if (typeof data === "string") {
    return data;
  } else {
    throw new Error(`response.getString() of unexpected type: ${typeof data}`);
  }
}

function addData(stream, data) {
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

export class ServerResponse extends http.ServerResponse {
  static from(res) {
    const response = new ServerResponse(res);

    response.statusCode = res.statusCode;
    response[HEADERS] = res.headers;
    response[BODY] = [Buffer.from(res.body)];
    response.end();

    return response;
  }

  static body(res) {
    return Buffer.concat(res[BODY]);
  }

  static headers(res) {
    const headers =
      typeof res.getHeaders === "function" ? res.getHeaders() : res._headers;

    return Object.assign(headers, res[HEADERS]);
  }

  get headers() {
    return this[HEADERS];
  }

  setHeader(key, value) {
    if (this._wroteHeader) {
      this[HEADERS][key] = value;
    } else {
      super.setHeader(key, value);
    }
    return this;
  }

  writeHead(statusCode, reason, obj) {
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

  constructor({ method, headers }) {
    super({ method, headers });

    this[BODY] = [];
    this[HEADERS] = headers || {};

    this.useChunkedEncodingByDefault = false;
    this.chunkedEncoding = false;
    this._header = "";

    this.assignSocket({
      _writableState: {},
      writable: true,
      on: Function.prototype,
      removeListener: Function.prototype,
      destroy: Function.prototype,
      cork: Function.prototype,
      uncork: Function.prototype,
      write: (data, encoding, cb) => {
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
      },
    });

    this.once("finish", () => {
      this.emit("close");
    });
  }
}
