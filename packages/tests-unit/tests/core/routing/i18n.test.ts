import { NextConfig } from "@opennextjs/aws/adapters/config/index.js";
import { localizePath } from "@opennextjs/aws/core/routing/i18n/index.js";
import { convertFromQueryString } from "@opennextjs/aws/core/routing/util.js";
import type { InternalEvent } from "@opennextjs/aws/types/open-next.js";
import { vi } from "vitest";

vi.mock("@opennextjs/aws/adapters/config/index.js", () => {
  return {
    NextConfig: {
      i18n: {
        defaultLocale: "en",
        locales: ["en", "fr"],
      },
    },
  };
});

vi.mock("@opennextjs/aws/core/routing/i18n/accept-header.js", () => ({
  acceptLanguage: (header: string, _?: string[]) => (header ? "fr" : undefined),
}));

type PartialEvent = Partial<
  Omit<InternalEvent, "body" | "rawPath" | "query">
> & { body?: string };

function createEvent(event: PartialEvent): InternalEvent {
  const [rawPath, qs] = (event.url ?? "/").split("?", 2);
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

beforeEach(() => {
  vi.resetAllMocks();
});

describe("localizePath", () => {
  it("should return raw path if no i18n config is set", () => {
    const i18nSpy = vi
      .spyOn(NextConfig, "i18n", "get")
      .mockReturnValue(undefined);

    const event = createEvent({
      url: "/foo",
    });

    const result = localizePath(event);

    expect(result).toEqual("/foo");

    i18nSpy.mockRestore();
  });

  it("should return default locale localized if localeDetection is set to false", () => {
    const i18nSpy = vi.spyOn(NextConfig, "i18n", "get").mockReturnValue({
      defaultLocale: "en",
      locales: ["en", "fr"],
      localeDetection: false,
    });

    const event = createEvent({
      url: "/foo",
      headers: {
        "accept-language": "fr",
      },
      cookies: {
        NEXT_LOCALE: "fr",
      },
    });

    const result = localizePath(event);

    expect(result).toEqual("/en/foo");

    i18nSpy.mockRestore();
  });

  it("should return the same path if the path is already localized", () => {
    const event = createEvent({
      url: "/fr/foo",
    });

    const result = localizePath(event);

    expect(result).toEqual("/fr/foo");
  });

  it("should get locale from cookies if NEXT_LOCALE cookie is set to a valid locale", () => {
    const event = createEvent({
      url: "/foo",
      cookies: {
        NEXT_LOCALE: "fr",
      },
    });

    const result = localizePath(event);

    expect(result).toEqual("/fr/foo");
  });

  it("should fallback on default locale if NEXT_LOCALE cookie is set to an invalid locale", () => {
    const event = createEvent({
      url: "/foo",
      cookies: {
        NEXT_LOCALE: "pt",
      },
    });

    const result = localizePath(event);

    expect(result).toEqual("/en/foo");
  });

  it("should use accept-language header if no cookie are present", () => {
    const event = createEvent({
      url: "/foo",
      headers: {
        "accept-language": "fr",
      },
    });

    const result = localizePath(event);

    expect(result).toEqual("/fr/foo");
  });

  it("should fallback to default locale if no cookie or header are set", () => {
    const event = createEvent({
      url: "/foo",
    });

    const result = localizePath(event);

    expect(result).toEqual("/en/foo");
  });
});
