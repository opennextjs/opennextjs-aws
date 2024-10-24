import { Buffer } from "node:buffer";

import { parseCookies } from "http/util";
import type { Converter, InternalEvent, InternalResult } from "types/open-next";

import type { MiddlewareOutputEvent } from "../../core/routingHandler";

const converter: Converter<
  InternalEvent,
  InternalResult | ({ type: "middleware" } & MiddlewareOutputEvent)
> = {
  convertFrom: async (event: Request) => {
    const searchParams = new URL(event.url).searchParams;
    const query: Record<string, string | string[]> = {};
    for (const [key, value] of searchParams.entries()) {
      if (query[key]) {
        if (Array.isArray(query[key])) {
          (query[key] as string[]).push(value);
        } else {
          query[key] = [query[key] as string, value];
        }
      } else {
        query[key] = value;
      }
    }
    //Transform body into Buffer
    const body = await event.arrayBuffer();
    const headers: Record<string, string> = {};
    event.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const rawPath = new URL(event.url).pathname;
    const method = event.method;
    const shouldHaveBody = method !== "GET" && method !== "HEAD";

    return {
      type: "core",
      method,
      rawPath,
      url: event.url,
      body: shouldHaveBody ? Buffer.from(body) : undefined,
      headers: headers,
      remoteAddress: (event.headers.get("x-forwarded-for") as string) ?? "::1",
      query,
      cookies: Object.fromEntries(
        parseCookies(event.headers.get("cookie") ?? "")?.map((cookie) => {
          const [key, value] = cookie.split("=");
          return [key, value];
        }) ?? [],
      ),
    };
  },
  convertTo: async (result) => {
    if ("internalEvent" in result) {
      let url = result.internalEvent.url;
      if (!result.isExternalRewrite) {
        if (result.origin) {
          url = `${result.origin.protocol}://${result.origin.host}${
            result.origin.port ? `:${result.origin.port}` : ""
          }${url}`;
        } else {
          url = `https://${result.internalEvent.headers.host}${url}`;
        }
      }

      const req = new Request(url, {
        body: result.internalEvent.body,
        method: result.internalEvent.method,
        headers: {
          ...result.internalEvent.headers,
          "x-forwarded-host": result.internalEvent.headers.host,
        },
      });

      const cfCache =
        (result.isISR ||
          result.internalEvent.rawPath.startsWith("/_next/image")) &&
        process.env.DISABLE_CACHE !== "true"
          ? { cacheEverything: true }
          : {};

      return fetch(req, {
        // This is a hack to make sure that the response is cached by Cloudflare
        // See https://developers.cloudflare.com/workers/examples/cache-using-fetch/#caching-html-resources
        // @ts-expect-error - This is a Cloudflare specific option
        cf: cfCache,
      });
    } else {
      const headers = new Headers();
      for (const [key, value] of Object.entries(result.headers)) {
        headers.set(key, Array.isArray(value) ? value.join(",") : value);
      }
      return new Response(result.body as ReadableStream, {
        status: result.statusCode,
        headers: headers,
      });
    }
  },
  name: "edge",
};

export default converter;
