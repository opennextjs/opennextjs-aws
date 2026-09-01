export interface BaseOpenNextError {
  readonly __openNextInternal: true;
  readonly canIgnore: boolean;
  // 0 - debug, 1 - warn, 2 - error
  readonly logLevel: 0 | 1 | 2;
  readonly statusCode?: number;
}

// This is an error that can be totally ignored
// It don't even need to be logged, or only in debug mode
export class IgnorableError extends Error implements BaseOpenNextError {
  readonly __openNextInternal = true;
  readonly canIgnore = true;
  readonly logLevel = 0;
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "IgnorableError";
    this.statusCode = statusCode;
  }
}

// This is an error that can be recovered from
// It should be logged but the process can continue
export class RecoverableError extends Error implements BaseOpenNextError {
  readonly __openNextInternal = true;
  readonly canIgnore = true;
  readonly logLevel = 1;
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "RecoverableError";
    this.statusCode = statusCode;
  }
}

// We should not continue the process if this error is thrown
export class FatalError extends Error implements BaseOpenNextError {
  readonly __openNextInternal = true;
  readonly canIgnore = false;
  readonly logLevel = 2;
  readonly statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "FatalError";
    this.statusCode = statusCode;
  }
}

export function isOpenNextError(e: any): e is BaseOpenNextError & Error {
  try {
    return "__openNextInternal" in e;
  } catch {
    return false;
  }
}
