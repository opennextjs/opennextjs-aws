import type { Writable } from "stream";
import type { APIGatewayProxyEventV2, Context } from "aws-lambda";

export interface ResponseStream extends Writable {
  getBufferedData(): Buffer;
  setContentType(contentType: string): void;
}

type Handler = (
  event: APIGatewayProxyEventV2,
  responseStream: ResponseStream,
  context: Context,
) => Promise<any>;

interface Metadata {
  statusCode: number;
  headers: Record<string, string>;
}

declare global {
  namespace awslambda {
    function streamifyResponse(handler: Handler): Handler;
    namespace HttpResponseStream {
      function from(res: Writable, metadata: Metadata): ResponseStream;
    }
  }
}
