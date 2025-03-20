const config = {
  default: {
    override: {
      wrapper: "aws-lambda-streaming",
    },
  },
  functions: {},
  buildCommand: "npx turbo build",
};

module.exports = config;
