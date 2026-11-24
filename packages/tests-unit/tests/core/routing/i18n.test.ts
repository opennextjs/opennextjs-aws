import { NextConfig } from "@opennextjs/aws/adapters/config/index.js";
import {
  handleLocaleRedirect,
  localizePath,
  localizePathname,
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
      trailingSlash: undefined,
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

  describe("with the default locale", () => {
    it.each([
      ["a NEXT_LOCALE cookie", { cookies: { NEXT_LOCALE: "fr" } }],
      [
        "an accept-language header",
        { headers: { "accept-language": "fr-FR,fr;q=0.9" } },
      ],
    ])("should ignore %s", (_, preference) => {
      const event = createEvent({ url: "http://localhost/foo", ...preference });

      expect(localizePath(event)).toEqual("/fr/foo");
      expect(localizePath(event, "default")).toEqual("/en/foo");
    });

    it("should keep the locale of the path", () => {
      const event = createEvent({ url: "http://localhost/fr/foo" });

      expect(localizePath(event, "default")).toEqual("/fr/foo");
    });

    it.each(["mydomain.fr", "MyDomain.FR", "mydomain.fr:443", "mydomain.fr:"])(
      "uses the domain default locale for host %s",
      (host) => {
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
        });

        const event = createEvent({
          url: `https://${host}/foo`,
          headers: { host },
        });

        expect(localizePath(event, "default")).toEqual("/fr/foo");

        i18nSpy.mockRestore();
      },
    );
  });

  describe("with a basePath", () => {
    beforeEach(() => {
      NextConfig.basePath = "/docs";
    });

    afterEach(() => {
      NextConfig.basePath = undefined;
    });

    it.each([
      ["/docs/admin", "/docs/en/admin"],
      ["/docs/admin/users", "/docs/en/admin/users"],
      ["/docs/api/users", "/docs/en/api/users"],
      ["/docs", "/docs/en"],
      ["/docs/", "/docs/en/"],
      ["/docs/docs/admin", "/docs/en/docs/admin"],
    ])(
      "should insert the locale after the basePath in %s",
      (path, expected) => {
        const event = createEvent({ url: `http://localhost${path}` });

        expect(localizePath(event)).toEqual(expected);
      },
    );

    it.each([
      ["/docs/fr/admin", "/docs/fr/admin"],
      ["/docs/FR/admin", "/docs/FR/admin"],
      ["/docs/en", "/docs/en"],
    ])(
      "should keep the locale following the basePath in %s",
      (path, expected) => {
        const event = createEvent({ url: `http://localhost${path}` });

        expect(localizePath(event)).toEqual(expected);
      },
    );

    it("should use the detected locale", () => {
      const event = createEvent({
        url: "http://localhost/docs/admin",
        cookies: { NEXT_LOCALE: "fr" },
      });

      expect(localizePath(event)).toEqual("/docs/fr/admin");
    });

    it("should use the detected locale for the basePath root", () => {
      const event = createEvent({
        url: "http://localhost/docs",
        cookies: { NEXT_LOCALE: "fr" },
      });

      expect(localizePath(event)).toEqual("/docs/fr");
    });

    it.each([
      ["/docs/admin", "/docs/en/admin"],
      ["/docs", "/docs/en"],
      ["/docs/fr/admin", "/docs/fr/admin"],
    ])(
      "should localize %s with the default locale after the basePath",
      (path, expected) => {
        const event = createEvent({
          url: `http://localhost${path}`,
          cookies: { NEXT_LOCALE: "fr" },
        });

        expect(localizePath(event, "default")).toEqual(expected);
      },
    );

    it.each([
      ["/admin", "/en/admin"],
      ["/fr/admin", "/fr/admin"],
      ["/docsadmin", "/en/docsadmin"],
    ])(
      "should localize %s outside of the basePath as a whole",
      (path, expected) => {
        const event = createEvent({ url: `http://localhost${path}` });

        expect(localizePath(event)).toEqual(expected);
      },
    );

    it("should not change the path without i18n", () => {
      const i18nSpy = vi
        .spyOn(NextConfig, "i18n", "get")
        .mockReturnValue(undefined);

      const event = createEvent({ url: "http://localhost/docs" });

      expect(localizePath(event)).toEqual("/docs");

      i18nSpy.mockRestore();
    });
  });
});

describe("localizePath with mixed case locales", () => {
  let i18nSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    i18nSpy = vi.spyOn(NextConfig, "i18n", "get").mockReturnValue({
      defaultLocale: "en-US",
      locales: ["en-US", "fr", "nl-NL"],
    });
  });

  afterEach(() => {
    i18nSpy.mockRestore();
    NextConfig.basePath = undefined;
  });

  it.each([
    "/en-US/admin",
    "/en-us/admin",
    "/EN-US/admin",
    "/nl-NL/admin",
    "/nl-nl",
    "/fr/admin",
    "/FR/admin",
  ])("should not localize %s again", (path) => {
    const event = createEvent({ url: `http://localhost${path}` });

    expect(localizePath(event)).toEqual(path);
  });

  it.each([
    ["/admin", "/en-US/admin"],
    ["/en/admin", "/en-US/en/admin"],
    ["/en-USA/admin", "/en-US/en-USA/admin"],
  ])("should localize %s", (path, expected) => {
    const event = createEvent({ url: `http://localhost${path}` });

    expect(localizePath(event)).toEqual(expected);
  });

  it.each([
    ["/docs/en-US/admin", "/docs/en-US/admin"],
    ["/docs/en-us/admin", "/docs/en-us/admin"],
    ["/docs/admin", "/docs/en-US/admin"],
  ])("should localize %s after the basePath", (path, expected) => {
    NextConfig.basePath = "/docs";

    const event = createEvent({ url: `http://localhost${path}` });

    expect(localizePath(event)).toEqual(expected);
  });
});

describe("localizePathname", () => {
  it("should localize a pathname without the basePath", () => {
    NextConfig.basePath = "/docs";
    try {
      // The pathname is never stripped from the basePath again
      const event = createEvent({ url: "http://localhost/docs/docs/admin" });

      expect(localizePathname(event, "/docs/admin")).toEqual("/en/docs/admin");
      expect(localizePathname(event, "/fr/admin")).toEqual("/fr/admin");
    } finally {
      NextConfig.basePath = undefined;
    }
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

  it("should redirect to the localized path with a query parameter", () => {
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

  it("should redirect to the localized path with a query parameter when trailingSlash is true", () => {
    const trailingSlashSpy = vi
      .spyOn(NextConfig, "trailingSlash", "get")
      .mockReturnValue(true);

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
        Location: "http://localhost/fr/?foo=bar",
      },
    });

    trailingSlashSpy.mockRestore();
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
