declare global {
  var openNextDebug: boolean;
}

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
  if (
    args.some((arg: AwsSdkClientCommandErrorLog) => isDownplayedErrorLog(arg))
  ) {
    warn(...args);
    return;
  }

  console.error(...args);
}

export const awsLogger = {
  trace: () => {},
  debug: () => {},
  info: debug,
  warn,
  error,
};
