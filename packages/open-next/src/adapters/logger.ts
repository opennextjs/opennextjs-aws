import { isOpenNextError } from "utils/error.js";

export function debug(...args: any[]) {
  if (globalThis.openNextDebug) {
    console.log(...args);
  }
}

export function warn(...args: any[]) {
  console.warn(...args);
}

interface AwsSdkClientCommandErrorLog {
  clientName: string;
  commandName: string;
  error: Error & { Code?: string };
}

type AwsSdkClientCommandErrorInput = Pick<
  AwsSdkClientCommandErrorLog,
  "clientName" | "commandName"
> & {
  errorName: string;
};

const DOWNPLAYED_ERROR_LOGS: AwsSdkClientCommandErrorInput[] = [
  {
    clientName: "S3Client",
    commandName: "GetObjectCommand",
    errorName: "NoSuchKey",
  },
];

const isDownplayedErrorLog = (errorLog: AwsSdkClientCommandErrorLog) =>
  DOWNPLAYED_ERROR_LOGS.some(
    (downplayedInput) =>
      downplayedInput.clientName === errorLog?.clientName &&
      downplayedInput.commandName === errorLog?.commandName &&
      (downplayedInput.errorName === errorLog?.error?.name ||
        downplayedInput.errorName === errorLog?.error?.Code),
  );

function serializeError(error: Error): Record<string, unknown> {
  return {
    ...error,
    name: error.name,
    message: error.message,
    ...(error.stack ? { stack: error.stack } : {}),
    ...(error.cause !== undefined
      ? {
          cause:
            error.cause instanceof Error
              ? serializeError(error.cause)
              : error.cause,
        }
      : {}),
  };
}

function writeError(args: any[]) {
  const errorIndex = args.findIndex((arg) => arg instanceof Error);
  if (args.length === 1 || errorIndex === -1) {
    return console.error(...args);
  }

  const messageIndex = args.findIndex((arg) => typeof arg === "string");
  const error = args[errorIndex] as Error;
  const details = args.filter(
    (_, index) => index !== messageIndex && index !== errorIndex,
  );

  console.error({
    message: messageIndex === -1 ? error.message : args[messageIndex],
    error: serializeError(error),
    ...(details.length > 0 ? { details } : {}),
  });
}

export function error(...args: any[]) {
  // we try to catch errors from the aws-sdk client and downplay some of them
  if (args.some((arg) => isDownplayedErrorLog(arg))) {
    return debug(...args);
  }
  if (args.some((arg) => isOpenNextError(arg))) {
    // In case of an internal error, we log it with the appropriate log level
    const error = args.find((arg) => isOpenNextError(arg))!;
    if (error.logLevel < getOpenNextErrorLogLevel()) {
      return;
    }
    if (error.logLevel === 0) {
      // Display the name and the message instead of full Open Next errors.
      // console.log is used so that logging does not depend on openNextDebug.
      return console.log(
        ...args.map((arg) =>
          isOpenNextError(arg) ? `${arg.name}: ${arg.message}` : arg,
        ),
      );
    }
    if (error.logLevel === 1) {
      // Display the name and the message instead of full Open Next errors.
      return warn(
        ...args.map((arg) =>
          isOpenNextError(arg) ? `${arg.name}: ${arg.message}` : arg,
        ),
      );
    }
    return writeError(args);
  }
  writeError(args);
}

export const awsLogger = {
  trace: () => {},
  debug: () => {},
  info: debug,
  warn,
  error,
};

/**
 * Retrieves the log level for internal errors from the
 * OPEN_NEXT_ERROR_LOG_LEVEL environment variable.
 *
 * @returns The numerical log level 0 (debug), 1 (warn), or 2 (error)
 */
function getOpenNextErrorLogLevel(): number {
  const strLevel = process.env.OPEN_NEXT_ERROR_LOG_LEVEL ?? "1";
  switch (strLevel.toLowerCase()) {
    case "debug":
    case "0":
      return 0;
    case "error":
    case "2":
      return 2;
    default:
      return 1;
  }
}
