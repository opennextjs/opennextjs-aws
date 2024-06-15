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
    return globalThis.internalFetch(signed.url, {
      method: signed.method,
      headers,
      body: init.body,
    });
  };
}
