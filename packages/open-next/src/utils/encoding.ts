/**
 * `ResponseInit` extended with the workerd-specific `encodeBody` option.
 *
 * workerd defaults to `encodeBody: "automatic"`, which encodes the body according to the
 * `content-encoding` header. `"manual"` tells it that the body is already encoded.
 * Other runtimes ignore the option.
 *
 * See https://developers.cloudflare.com/workers/runtime-apis/response/#parameters
 */
export type ResponseInitWithEncodeBody = ResponseInit & {
  encodeBody?: "automatic" | "manual";
};

/**
 * Internal header used to carry `encodeBody: "manual"` from the Response returned by the app
 * to the Response returned by the wrapper.
 *
 * workerd does not expose `encodeBody` on a Response, and the option is lost when Next.js pipes the
 * app Response into the Node response. The header survives that trip and is removed by the wrapper
 * or converter before the response is sent.
 *
 * The header is reserved for internal use: it is removed from external (proxied) responses.
 */
export const ENCODE_BODY_HEADER = "x-opennext-encode-body";

/**
 * Key on `globalThis` that holds the original `Response` class once the patch is installed.
 */
export const ENCODE_BODY_PATCH_KEY = Symbol.for(
  "@opennextjs/aws/encode-body-patch",
);

/**
 * Patches `globalThis.Response` so that a Response created with `encodeBody: "manual"` is tagged
 * with the `ENCODE_BODY_HEADER` header.
 *
 * Only the Response classes evaluated after this call are patched:
 * a class extending `Response` (e.g. `NextResponse`) captures the global at definition time.
 *
 * The patch is installed only once.
 */
export function installResponsePatch(): void {
  if (Reflect.has(globalThis, ENCODE_BODY_PATCH_KEY)) {
    return;
  }

  const OriginalResponse = globalThis.Response;

  class EncodeBodyResponse extends OriginalResponse {
    constructor(body?: BodyInit | null, init?: ResponseInitWithEncodeBody) {
      super(body, init);
      if (init?.encodeBody === "manual") {
        try {
          this.headers.set(ENCODE_BODY_HEADER, "manual");
        } catch {
          // The headers are immutable
        }
      }
    }
  }

  // Keep `instanceof Response` working for instances of the original class
  // (e.g. `fetch` results and `Response.json()` output).
  // Subclasses (e.g. `NextResponse`) inherit this static and keep the default behavior.
  Object.defineProperty(EncodeBodyResponse, Symbol.hasInstance, {
    value: function (this: unknown, value: unknown): boolean {
      return this === EncodeBodyResponse
        ? value instanceof OriginalResponse
        : Function.prototype[Symbol.hasInstance].call(this, value);
    },
  });

  // Keep `Response.name` (e.g. used in error messages and logs)
  Object.defineProperty(EncodeBodyResponse, "name", { value: "Response" });

  Reflect.set(globalThis, ENCODE_BODY_PATCH_KEY, OriginalResponse);
  globalThis.Response = EncodeBodyResponse;
}

/**
 * Removes the `ENCODE_BODY_HEADER` header and returns whether the body is already encoded.
 */
export function takeEncodeBodyTag(headers: Headers): boolean {
  // Same-name headers are joined with ", "
  const isManual =
    headers
      .get(ENCODE_BODY_HEADER)
      ?.split(",")
      .some((value) => value.trim() === "manual") ?? false;
  headers.delete(ENCODE_BODY_HEADER);
  return isManual;
}

/**
 * Creates the Response sent to the client.
 *
 * `encodeBody: "manual"` is passed only when `encodeBodyManual` is set.
 * The `ENCODE_BODY_HEADER` header added by the patched Response is removed.
 */
export function createResponse(
  body: BodyInit | null,
  status: number,
  headers: Headers,
  encodeBodyManual: boolean,
): Response {
  const init: ResponseInitWithEncodeBody = encodeBodyManual
    ? { status, headers, encodeBody: "manual" }
    : { status, headers };
  const response = new Response(body, init);
  if (encodeBodyManual) {
    response.headers.delete(ENCODE_BODY_HEADER);
  }
  return response;
}
