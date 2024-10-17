import "@opennextjs/aws/core/createGenericHandler.js";

import { convertFromQueryString } from "@opennextjs/aws/core/routing/util.js";
import routingHandler from "@opennextjs/aws/core/routingHandler.js";
import {
  InternalEvent,
  InternalResult,
} from "@opennextjs/aws/types/open-next.js";
import fs from "fs";
import path from "path";
import { vi } from "vitest";

type PartialEvent = Partial<
  Omit<InternalEvent, "body" | "rawPath" | "query">
> & { body?: string };

function createEvent(event: PartialEvent): InternalEvent {
  const [rawPath, qs] = (event.url ?? "/").split("?", 1);
  return {
    type: "core",
    method: event.method ?? "GET",
    rawPath,
    url: event.url ?? "/",
    body: Buffer.from(event.body ?? ""),
    headers: event.headers ?? {},
    query: convertFromQueryString(qs ?? ""),
    cookies: event.cookies ?? {},
    remoteAddress: event.remoteAddress ?? "::1",
  };
}

globalThis.openNextConfig = {};

vi.mock("fs", async () => {
  const actualFs = (await vi.importActual("fs")) as typeof fs;
  const actualPath = (await vi.importActual("path")) as typeof path;

  const fileExpression =
    /^(?<prefix>.+)\/\.(?<relativePath>(next|open-next)\/.+)$/;

  // remap the file path to the mock directory
  const readFileSyncMock = vi.fn().mockImplementation((filename, encoding) => {
    const match = fileExpression.exec(filename);
    const mappedFilename = match
      ? actualPath.join(__dirname, "__mocks__", match.groups!.relativePath)
      : filename;

    return actualFs.readFileSync(mappedFilename, encoding);
  });

  return {
    ...actualFs,
    readFileSync: readFileSyncMock,
    default: {
      ...(actualFs as any).default,
      readFileSync: readFileSyncMock,
    },
  };
});

beforeEach(() => {
  vi.resetAllMocks();
});

it("should return 404 for data requests that don't match the buildId", async () => {
  const event = createEvent({
    url: "/_next/data/abc/test",
  });

  const response = (await routingHandler(event)) as InternalResult;

  expect(response.statusCode).toEqual(404);
});

it("should not return 404 for data requests that match the buildId", async () => {
  const event = createEvent({
    url: "/_next/data/lnRb3bjsx2nspyrLXPfpa/test",
  });

  const response = (await routingHandler(event)) as InternalResult;

  expect(response.statusCode).not.toEqual(404);
});

it("should redirect trailing slashes", async () => {
  const event = createEvent({
    url: "/api-route/",
  });

  const response = (await routingHandler(event)) as InternalResult;

  expect(response.statusCode).toEqual(308);
  expect(response.headers.Location).toEqual("/api-route");
});
