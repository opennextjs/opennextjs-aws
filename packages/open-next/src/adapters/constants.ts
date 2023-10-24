export const MAX_DYNAMO_BATCH_WRITE_ITEM_COUNT = 25;

/**
 * Sending to dynamo X commands at a time, using about X * 25 write units per batch to not overwhelm DDB
 * and give production plenty of room to work with. With DDB Response times, you can expect about 10 batches per second.
 */
const DEFAULT_DYNAMO_BATCH_WRITE_COMMAND_CONCURRENCY = 4;

export const getDynamoBatchWriteCommandConcurrency = (): number => {
  const dynamoBatchWriteCommandConcurrencyFromEnv =
    process.env.DYNAMO_BATCH_WRITE_COMMAND_CONCURRENCY;
  const parsedDynamoBatchWriteCommandConcurrencyFromEnv =
    dynamoBatchWriteCommandConcurrencyFromEnv
      ? parseInt(dynamoBatchWriteCommandConcurrencyFromEnv)
      : undefined;

  if (
    parsedDynamoBatchWriteCommandConcurrencyFromEnv &&
    !isNaN(parsedDynamoBatchWriteCommandConcurrencyFromEnv)
  ) {
    return parsedDynamoBatchWriteCommandConcurrencyFromEnv;
  }

  return DEFAULT_DYNAMO_BATCH_WRITE_COMMAND_CONCURRENCY;
};
