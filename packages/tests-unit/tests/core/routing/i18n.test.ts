import { NextConfig } from "@opennextjs/aws/adapters/config/index.js";
import {
  handleLocaleRedirect,
  localizePath,
} from "@opennextjs/aws/core/routing/i18n/index.js";
import { convertFromQueryString } from "@opennextjs/aws/core/routing/util.js";
import type { InternalEvent } from "@opennextjs/aws/types/open-next.js";
import { expect, vi } from "vitest";

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

type PartialEvent = Partial<
  Omit<InternalEvent, "body" | "rawPath" | "query">
> & { body?: string };

function createEvent(event: PartialEvent): InternalEvent {
  const url = new URL(event.url ?? "/");
  const rawPath = url.pathname;
  const qs = url.search.slice(1);
  return {
    type: "core",
    method: event.method ?? "GET",
    rawPath,
    url: event.url ?? "/",
    body: Buffer.from(event.body ?? ""),
    headers: event.headers ?? {},
    query: convertFromQueryString(qs),
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
      url: "http://localhost/foo",
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
      url: "http://localhost/foo",
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
      url: "http://localhost/fr/foo",
    });

    const result = localizePath(event);

    expect(result).toEqual("/fr/foo");
  });

  it("should get locale from cookies if NEXT_LOCALE cookie is set to a valid locale", () => {
    const event = createEvent({
      url: "http://localhost/foo",
      cookies: {
        NEXT_LOCALE: "fr",
      },
    });

    const result = localizePath(event);

    expect(result).toEqual("/fr/foo");
  });

  it("should fallback on default locale if NEXT_LOCALE cookie is set to an invalid locale", () => {
    const event = createEvent({
      url: "http://localhost/foo",
      cookies: {
        NEXT_LOCALE: "pt",
      },
    });

    const result = localizePath(event);

    expect(result).toEqual("/en/foo");
  });

  it("should use accept-language header if no cookie are present", () => {
    const event = createEvent({
      url: "http://localhost/foo",
      headers: {
        "accept-language": "fr",
      },
    });

    const result = localizePath(event);

    expect(result).toEqual("/fr/foo");
  });

  it("should fallback to default locale if no cookie or header are set", () => {
    const event = createEvent({
      url: "http://localhost/foo",
    });

    const result = localizePath(event);

    expect(result).toEqual("/en/foo");
  });

  it("should use default locale if localeDetection is set to false", () => {
    const i18nSpy = vi.spyOn(NextConfig, "i18n", "get").mockReturnValue({
      defaultLocale: "en",
      locales: ["en", "fr"],
      localeDetection: false,
    });

    const event = createEvent({
      url: "http://localhost/foo",
    });

    const result = localizePath(event);

    expect(result).toEqual("/en/foo");

    i18nSpy.mockRestore();
  });

  it("should use domain default locale if localeDetection is set to false but with a domain", () => {
    const i18nSpy = vi.spyOn(NextConfig, "i18n", "get").mockReturnValue({
      defaultLocale: "en",
      locales: ["en", "fr"],
      domains: [
        {
          domain: "mydomain.com",
          defaultLocale: "en",
        },
        {
          domain: "mydomain.fr",
          defaultLocale: "fr",
        },
      ],
      localeDetection: false,
    });

    const event = createEvent({
      url: "http://mydomain.fr/foo",
      headers: {
        host: "mydomain.fr",
      },
    });

    const result = localizePath(event);

    expect(result).toEqual("/fr/foo");

    i18nSpy.mockRestore();
  });
});

describe("handleLocaleRedirect", () => {
  it("should redirect to the localized path if the path is not localized", () => {
    const event = createEvent({
      url: "http://localhost",
      headers: {
        "accept-language": "fr",
      },
    });

    const result = handleLocaleRedirect(event);

    expect(result).toMatchObject({
      statusCode: 307,
      headers: {
        Location: "http://localhost/fr",
      },
    });
  });

  it("should not redirect if the path is already localized", () => {
    const event = createEvent({
      url: "http://localhost/fr",
    });

    const result = handleLocaleRedirect(event);

    expect(result).toBe(false);
  });

  it("should not redirect if not the root path", () => {
    const event = createEvent({
      url: "http://localhost/foo",
    });

    const result = handleLocaleRedirect(event);

    expect(result).toBe(false);
  });

  it("should preserve query parameters when redirecting to localized path", () => {
    const event = createEvent({
      url: "http://localhost?foo=bar",
      headers: {
        "accept-language": "fr",
      },
    });

    const result = handleLocaleRedirect(event);

    expect(result).toMatchObject({
      statusCode: 307,
      headers: {
        Location: "http://localhost/fr?foo=bar",
      },
    });
  });

  describe("using domain", () => {
    it("should redirect to the preferred domain if the domain is different", () => {
      vi.spyOn(NextConfig, "i18n", "get").mockReturnValue({
        defaultLocale: "en",
        locales: ["en", "en-US", "en-CA", "fr"],
        domains: [
          {
            domain: "mydomain.com",
            defaultLocale: "en",
          },
          {
            domain: "localhost",
            defaultLocale: "fr",
            http: true,
          },
        ],
      });
      const event = createEvent({
        url: "http://mydomain.com",
        headers: {
          host: "mydomain.com",
          "accept-language": "fr",
        },
      });

      const result = handleLocaleRedirect(event);

      expect(result).toMatchObject({
        statusCode: 307,
        headers: {
          Location: "http://localhost/",
        },
      });
    });

    it("should redirect to the same domain with not default locale", () => {
      vi.spyOn(NextConfig, "i18n", "get").mockReturnValue({
        defaultLocale: "en",
        locales: ["en", "fr", "fr-FR"],
        domains: [
          {
            domain: "mydomain.com",
            defaultLocale: "en",
          },
          {
            domain: "localhost",
            defaultLocale: "fr",
            locales: ["fr-FR"],
            http: true,
          },
        ],
      });
      const event = createEvent({
        url: "http://localhost",
        headers: {
          host: "localhost",
          "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
        },
      });

      const result = handleLocaleRedirect(event);

      expect(result).toMatchObject({
        statusCode: 307,
        headers: {
          Location: "http://localhost/fr-FR",
        },
      });
    });

    it("should redirect to different domain with not default locale", () => {
      vi.spyOn(NextConfig, "i18n", "get").mockReturnValue({
        defaultLocale: "en",
        locales: ["en", "fr", "fr-FR"],
        domains: [
          {
            domain: "mydomain.com",
            defaultLocale: "en",
          },
          {
            domain: "localhost",
            defaultLocale: "fr",
            locales: ["fr-FR"],
            http: true,
          },
        ],
      });
      const event = createEvent({
        url: "http://mydomain.com",
        headers: {
          host: "mydomain.com",
          "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
        },
      });

      const result = handleLocaleRedirect(event);

      expect(result).toMatchObject({
        statusCode: 307,
        headers: {
          Location: "http://localhost/fr-FR",
        },
      });
    });

    it("should not redirect if the domain and locale are the same", () => {
      vi.spyOn(NextConfig, "i18n", "get").mockReturnValue({
        defaultLocale: "en",
        locales: ["en", "fr", "fr-FR"],
        domains: [
          {
            domain: "mydomain.com",
            defaultLocale: "en",
          },
          {
            domain: "localhost",
            defaultLocale: "fr",
            locales: ["fr-FR"],
            http: true,
          },
        ],
      });
      const event = createEvent({
        url: "http://localhost/fr-FR",
        headers: {
          host: "localhost",
          "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
        },
      });

      const result = handleLocaleRedirect(event);

      expect(result).toBe(false);
    });

    it("should not redirect if locale is not found", () => {
      vi.spyOn(NextConfig, "i18n", "get").mockReturnValue({
        defaultLocale: "en",
        locales: ["en", "fr", "fr-FR"],
        domains: [
          {
            domain: "mydomain.com",
            defaultLocale: "en",
          },
          {
            domain: "localhost",
            defaultLocale: "fr",
            locales: ["fr-FR"],
            http: true,
          },
        ],
      });
      const event = createEvent({
        url: "http://localhost",
        headers: {
          host: "localhost",
          "accept-language": "es",
        },
      });

      const result = handleLocaleRedirect(event);

      expect(result).toBe(false);
    });
  });
});
