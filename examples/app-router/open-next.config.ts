const config = {
  default: {
    override: {
      wrapper: "aws-lambda-streaming",
      queue: "sqs-lite",
      incrementalCache: "s3-lite",
      tagCache: "dynamodb-lite",
    },
  },
  functions: {},
  dangerous: {
    middlewareHeadersOverrideNextConfigHeaders: true,
    enableCacheInterception: true,
  },
  buildCommand: "npx turbo build",
};

export default config;
