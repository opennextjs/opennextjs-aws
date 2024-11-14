import type { BaseOpenNextError } from "utils/error";

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

export function error(...args: any[]) {
  // we try to catch errors from the aws-sdk client and downplay some of them
  if (
    args.some((arg: AwsSdkClientCommandErrorLog) => isDownplayedErrorLog(arg))
  ) {
    debug(...args);
  } else if (args.some((arg) => arg.__openNextInternal)) {
    // In case of an internal error, we log it with the appropriate log level
    const error = args.find(
      (arg) => arg.__openNextInternal,
    ) as BaseOpenNextError;
    if (error.logLevel === 0) {
      debug(...args);
      return;
    }
    if (error.logLevel === 1) {
      warn(...args);
      return;
    }
    console.error(...args);
    return;
  } else {
    console.error(...args);
  }
}

export const awsLogger = {
  trace: () => {},
  debug: () => {},
  info: debug,
  warn,
  error,
};
