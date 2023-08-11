import http from 'node:http';
import type { ResponseStream } from '../types/aws-lambda.js';
import { debug, error } from '../logger.js';
import { getString, headerEnd } from './utils.js';

const HEADERS = Symbol();
const BODY = Symbol();

export class StreamingServerResponse extends http.ServerResponse {
  [HEADERS]: Record<string, string> = {};
  [BODY]: any[] = [];
  responseStream: ResponseStream;
  fixHeaders: (headers: Record<string, string>) => void;
  private _wroteHeader = false;
  private _done = false;
  private _hasWritten = false;
  timer: NodeJS.Timer | null = null;

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
    headers?: http.OutgoingHttpHeaders | http.OutgoingHttpHeader[] | undefined
  ): this;
  writeHead(
    statusCode: number,
    headers?: http.OutgoingHttpHeaders | http.OutgoingHttpHeader[] | undefined
  ): this;
  writeHead(
    statusCode: unknown,
    statusMessage?: unknown,
    headers?: unknown
  ): this {
    if (!this._wroteHeader) {
      this.fixHeaders(this[HEADERS]);
      try {
        this.responseStream = awslambda.HttpResponseStream.from(
          this.responseStream,
          {
            statusCode: statusCode as number,
            headers: this[HEADERS],
          }
        );
        if (!this.timer) {
          this.createListener();
        }

        this._wroteHeader = true;
        debug('writeHead', this[HEADERS]);
      } catch (e) {
        this.responseStream.end();
        error(e);
      }
    }
    return this;
  }

  // WORKAROUND: It seems that lambda streaming require the event loop to be free
  //             to start the streaming process. So we need to give it some time
  // TODO: Find a better way to do this
  private createListener = () => {
    this.timer = setInterval(() => {
      if (this[BODY].length) {
        const toWrite = getString(this[BODY].shift());
        debug('write', toWrite);
        if (this.responseStream.writableNeedDrain) return;
        this.responseStream.write(toWrite);
        this._hasWritten = true;
        return;
      }
      if (this._done) {
        debug('done', this._done);
        clearInterval(this.timer!);
        if (!this._hasWritten) {
          // We need to send data here, otherwise the stream will not end at all
          this.responseStream.write(new Uint8Array(8));
        }
        this.responseStream.end();
        return;
      }
    }, 1);
  };

  end(cb?: (() => void) | undefined): this;
  end(chunk: any, cb?: (() => void) | undefined): this;
  end(
    chunk: any,
    encoding: BufferEncoding,
    cb?: (() => void) | undefined
  ): this;
  end(chunk?: unknown, encoding?: unknown, cb?: unknown): this {
    if (chunk && typeof chunk !== 'function') {
      this[BODY].push(chunk);
    }
    if (!this._wroteHeader) {
      // When next directly returns with end, the writeHead is not called,
      // so we need to call it here
      this.writeHead(200);
    }
    this._done = true;
    debug('stream end', chunk);
    return this;
  }

  constructor(
    { method }: { method?: string },
    responseStream: ResponseStream,
    fixHeaders: (headers: Record<string, string>) => void
  ) {
    //@ts-ignore
    super({ method });

    this[HEADERS] = {};
    this[BODY] = [];

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
        if (typeof encoding === 'function') {
          cb = encoding;
          encoding = undefined;
        }

        if (this._wroteHeader) {
          this[BODY].push(data);
        } else {
          const string = getString(data);
          const index = string.indexOf(headerEnd);

          if (index !== -1) {
            const remainder = string.slice(index + headerEnd.length);

            if (remainder) {
              this[BODY].push(data);
            }

            this._wroteHeader = true;
          }
        }

        if (typeof cb === 'function') {
          cb();
        }
        return true;
      },
    });

    this.responseStream.on('error', (err) => {
      this.emit('error', err);
      this.responseStream.end();
      error('error', err);
    });
  }
}
