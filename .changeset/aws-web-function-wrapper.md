---
"@opennextjs/aws": minor
---

feat: add the `aws-web-function` wrapper for AWS Lambda Web Functions

A Web Function runs an HTTP server that Lambda routes requests to, so there is no event handler or API Gateway in front of it. The wrapper is the `node` wrapper (use it with the `node` converter) that binds the host and port in `AWS_LAMBDA_HTTP_ENDPOINT`, falling back to `PORT` outside a Web Function, and provides `waitUntil` so deferred work such as revalidation messages is awaited. A failing request is answered with a 500 instead of crashing the server, and on `SIGTERM` the wrapper waits up to 800ms for in-flight `waitUntil` work before exiting, within the 1 second Lambda allows.

```ts
export default {
  default: {
    override: {
      wrapper: "aws-web-function",
      converter: "node",
    },
  },
};
```
