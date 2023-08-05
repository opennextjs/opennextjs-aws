import { ResponseStream } from "../types.js";

/*
This is a AWS's implementation of Lambda Streaming.
It allows us to return larger responses than the 6MB limit of Lambda.

Credits to:
- @adamelmore (https://github.com/serverless-stack/sst/pull/3165)
- @astuyve (https://github.com/astuyve/lambda-stream)

*/
export function streamSuccess(
    result: any, // NextJS Image optimization result.
    responseStream: ResponseStream
  ) {
    responseStream = awslambda.HttpResponseStream.from(responseStream, {
      statusCode: 200,
      headers: {
        Vary: "Accept",
        "Cache-Control": `public,max-age=${result.maxAge},immutable`,
        "Content-Type": result.contentType,
        'x-response-type': 'stream',
      }
    });

    responseStream.write(result.buffer)
    responseStream.end()
  }

export function streamError(
    statusCode: number,
    error: string | Error | any,
    responseStream: ResponseStream
  ) {
    console.error(error);

    responseStream = awslambda.HttpResponseStream.from(responseStream, {
      statusCode,
      headers: {
        Vary: "Accept",
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'x-response-type': 'stream',
      }
    });

    responseStream.write(JSON.stringify({
      message: 'Error has occured while processing image',
      body: error?.message || error?.toString() || error,
    }));

    responseStream.end();
  }