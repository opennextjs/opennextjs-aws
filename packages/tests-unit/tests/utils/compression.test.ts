import { getBrotliQuality } from "@opennextjs/aws/utils/compression.js";
import { afterEach, describe, expect, it } from "vitest";

describe("getBrotliQuality", () => {
  afterEach(() => {
    delete process.env.BROTLI_QUALITY;
  });

  it("defaults to 6", () => {
    expect(getBrotliQuality()).toBe(6);
  });

  it("uses BROTLI_QUALITY when it is a valid quality", () => {
    for (const quality of ["0", "4", "11"]) {
      process.env.BROTLI_QUALITY = quality;
      expect(getBrotliQuality()).toBe(Number(quality));
    }
  });

  it("falls back to 6 when BROTLI_QUALITY is not a valid quality", () => {
    for (const quality of ["", "abc", "-1", "12"]) {
      process.env.BROTLI_QUALITY = quality;
      expect(getBrotliQuality()).toBe(6);
    }
  });
});
