import { randomUUID } from "node:crypto";
import { type APIRequestContext, expect, test } from "@playwright/test";

async function runtimePrefetch(request: APIRequestContext, path: string) {
  const response = await request.get(path, {
    headers: { rsc: "1", "next-router-prefetch": "2" },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/x-component");
  return response.text();
}

test("a runtime prefetch includes the deepest request-dependent content", async ({
  request,
}) => {
  const slug = randomUUID();
  const body = await runtimePrefetch(request, `/staged-render/${slug}`);

  expect(body).toContain(`Deep shell complete: ${slug}`);
});

test("uncached I/O stays out of the prefetch and runs for each document", async ({
  request,
}) => {
  const path = `/staged-render/${randomUUID()}`;
  const prefetch = await runtimePrefetch(request, path);

  expect(prefetch).not.toContain("Uncached I/O:");
  expect(prefetch).toContain("Loading uncached data...");

  const readDocumentToken = async () => {
    const document = await request.get(path);
    expect(document.status()).toBe(200);
    expect(document.headers()["content-type"]).toContain("text/html");
    const token = (await document.text()).match(
      /<p>Uncached I\/O: ([0-9a-f]{32})<\/p>/,
    )?.[1];
    expect(
      token,
      "document should contain the result of uncached I/O",
    ).toBeDefined();
    return token;
  };

  const firstToken = await readDocumentToken();
  expect(await readDocumentToken()).not.toBe(firstToken);
});
