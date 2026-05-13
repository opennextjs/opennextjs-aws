import { beforeEach, describe, expect, it, vi } from "vitest";

// The file under test imports from `next/dist/server/image-optimizer` which
// is only available at runtime inside a user's built Next.js app. We mock the
// module so the tests can run independently of any Next.js installation.
const mockFetchExternalImage = vi.fn();
const mockFetchInternalImage = vi.fn();
const mockImageOptimizer = vi.fn();

vi.mock("next/dist/server/image-optimizer", () => ({
  fetchExternalImage: (...args: unknown[]) => mockFetchExternalImage(...args),
  fetchInternalImage: (...args: unknown[]) => mockFetchInternalImage(...args),
  imageOptimizer: (...args: unknown[]) => mockImageOptimizer(...args),
}));

vi.mock("@opennextjs/aws/adapters/logger.js", () => ({
  debug: vi.fn(),
}));

// Imported after the mocks are registered so the module uses the mocked
// versions.
const { optimizeImage } = await import(
  "@opennextjs/aws/adapters/plugins/image-optimization/image-optimization.replacement.js"
);

declare global {
  var nextVersion: string;
}

const HREF = "/some/image.png";
const UPSTREAM = { buffer: Buffer.from(""), contentType: "image/png" };
const OPTIMIZED = {
  buffer: Buffer.from("optimized"),
  contentType: "image/png",
};

const handleRequest = vi.fn();

function callOptimizeImage(
  overrides: {
    isAbsolute?: boolean;
    maximumResponseBody?: number;
  } = {},
) {
  const { isAbsolute = false, maximumResponseBody } = overrides;
  const headers = { "x-custom": "value" };
  const imageParams = { isAbsolute, href: HREF };
  const nextConfig = {
    images: maximumResponseBody ? { maximumResponseBody } : {},
  } as any;

  return optimizeImage(headers, imageParams, nextConfig, handleRequest);
}

describe("optimizeImage (replacement)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchExternalImage.mockResolvedValue(UPSTREAM);
    mockFetchInternalImage.mockResolvedValue(UPSTREAM);
    mockImageOptimizer.mockResolvedValue(OPTIMIZED);
  });

  describe("fetchExternalImage (isAbsolute=true)", () => {
    it("calls fetchExternalImage(href) for <= v15.5.9", async () => {
      globalThis.nextVersion = "15.5.9";
      await callOptimizeImage({ isAbsolute: true });
      expect(mockFetchExternalImage).toHaveBeenCalledTimes(1);
      expect(mockFetchExternalImage).toHaveBeenCalledWith(HREF);
    });

    it("calls fetchExternalImage(href, maximumResponseBody) for v15.5.10", async () => {
      globalThis.nextVersion = "15.5.10";
      await callOptimizeImage({ isAbsolute: true });
      expect(mockFetchExternalImage).toHaveBeenCalledWith(HREF, 50_000_000);
    });

    it("calls fetchExternalImage(href, maximumResponseBody) for v15.5.15", async () => {
      globalThis.nextVersion = "15.5.15";
      await callOptimizeImage({ isAbsolute: true });
      expect(mockFetchExternalImage).toHaveBeenCalledWith(HREF, 50_000_000);
    });

    it("calls fetchExternalImage(href, maximumResponseBody) for v15.5.16", async () => {
      // Internal fetch args change at 15.5.16, but external args stay
      // the same as 15.5.10+ until v16.
      globalThis.nextVersion = "15.5.16";
      await callOptimizeImage({ isAbsolute: true });
      expect(mockFetchExternalImage).toHaveBeenCalledWith(HREF, 50_000_000);
    });

    it("calls fetchExternalImage(href, false) for v16.0.0", async () => {
      globalThis.nextVersion = "16.0.0";
      await callOptimizeImage({ isAbsolute: true });
      expect(mockFetchExternalImage).toHaveBeenCalledWith(HREF, false);
    });

    it("calls fetchExternalImage(href, false) for v16.1.4", async () => {
      globalThis.nextVersion = "16.1.4";
      await callOptimizeImage({ isAbsolute: true });
      expect(mockFetchExternalImage).toHaveBeenCalledWith(HREF, false);
    });

    it("calls fetchExternalImage(href, false, maximumResponseBody) for v16.1.5", async () => {
      globalThis.nextVersion = "16.1.5";
      await callOptimizeImage({ isAbsolute: true });
      expect(mockFetchExternalImage).toHaveBeenCalledWith(
        HREF,
        false,
        50_000_000,
      );
    });

    it("calls fetchExternalImage(href, false, maximumResponseBody) for v16.2.5", async () => {
      globalThis.nextVersion = "16.2.5";
      await callOptimizeImage({ isAbsolute: true });
      expect(mockFetchExternalImage).toHaveBeenCalledWith(
        HREF,
        false,
        50_000_000,
      );
    });

    it("forwards a custom maximumResponseBody from nextConfig", async () => {
      globalThis.nextVersion = "16.2.5";
      await callOptimizeImage({
        isAbsolute: true,
        maximumResponseBody: 1_234,
      });
      expect(mockFetchExternalImage).toHaveBeenCalledWith(HREF, false, 1_234);
    });

    it("does not call fetchInternalImage", async () => {
      globalThis.nextVersion = "16.2.5";
      await callOptimizeImage({ isAbsolute: true });
      expect(mockFetchInternalImage).not.toHaveBeenCalled();
    });
  });

  describe("fetchInternalImage (isAbsolute=false)", () => {
    it("uses the old signature for v15.5.15", async () => {
      globalThis.nextVersion = "15.5.15";
      await callOptimizeImage({ isAbsolute: false });
      expect(mockFetchInternalImage).toHaveBeenCalledTimes(1);
      expect(mockFetchInternalImage).toHaveBeenCalledWith(
        HREF,
        { headers: { "x-custom": "value" } },
        {},
        handleRequest,
      );
    });

    it("uses the new signature for v15.5.16 (with maximumResponseBody)", async () => {
      globalThis.nextVersion = "15.5.16";
      await callOptimizeImage({ isAbsolute: false });
      expect(mockFetchInternalImage).toHaveBeenCalledWith(
        HREF,
        { headers: { "x-custom": "value" } },
        {},
        50_000_000,
        handleRequest,
      );
    });

    it("uses the old signature for v16.0.0 (< 16.2.5)", async () => {
      globalThis.nextVersion = "16.0.0";
      await callOptimizeImage({ isAbsolute: false });
      expect(mockFetchInternalImage).toHaveBeenCalledWith(
        HREF,
        { headers: { "x-custom": "value" } },
        {},
        handleRequest,
      );
    });

    it("uses the old signature for v16.2.4", async () => {
      globalThis.nextVersion = "16.2.4";
      await callOptimizeImage({ isAbsolute: false });
      expect(mockFetchInternalImage).toHaveBeenCalledWith(
        HREF,
        { headers: { "x-custom": "value" } },
        {},
        handleRequest,
      );
    });

    it("uses the new signature for v16.2.5+", async () => {
      globalThis.nextVersion = "16.2.5";
      await callOptimizeImage({ isAbsolute: false });
      expect(mockFetchInternalImage).toHaveBeenCalledWith(
        HREF,
        { headers: { "x-custom": "value" } },
        {},
        50_000_000,
        handleRequest,
      );
    });

    it("does not call fetchExternalImage", async () => {
      globalThis.nextVersion = "16.2.5";
      await callOptimizeImage({ isAbsolute: false });
      expect(mockFetchExternalImage).not.toHaveBeenCalled();
    });
  });

  describe("imageOptimizer", () => {
    it("is called with the upstream result and returns its value", async () => {
      globalThis.nextVersion = "16.2.5";
      const result = await callOptimizeImage({ isAbsolute: true });
      expect(mockImageOptimizer).toHaveBeenCalledTimes(1);
      expect(mockImageOptimizer).toHaveBeenCalledWith(
        UPSTREAM,
        { isAbsolute: true, href: HREF },
        expect.any(Object),
        false,
      );
      expect(result).toBe(OPTIMIZED);
    });
  });
});
