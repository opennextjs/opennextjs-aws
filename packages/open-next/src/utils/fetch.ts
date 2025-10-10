import type { AwsClient } from "aws4fetch";
// Because of Next take on fetch, and until it's fixed in Next 15 we have to pass some internals stuff to next for every fetch we do with aws4fetch
// For some reason passing this directly to client.fetch doesn't work
export function customFetchClient(client: AwsClient) {
  return async (input: RequestInfo, init: RequestInit) => {
    const signed = await client.sign(input, init);
    const headers: Record<string, string> = {};
    signed.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const response = await globalThis.internalFetch(signed.url, {
      method: signed.method,
      headers,
      body: init.body,
    });
    /**
     * Response body must be consumed to avoid socket error.
     * This is necessary otherwise we get some error : SocketError: other side closed
     * https://github.com/nodejs/undici/issues/583#issuecomment-855384858
     */
    return response.clone();
  };
}
