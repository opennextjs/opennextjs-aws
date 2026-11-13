import zlib from "node:zlib";

const DEFAULT_BROTLI_QUALITY = 6;

/**
 * Brotli quality used by the compressing wrappers.
 *
 * It can be set with the `BROTLI_QUALITY` environment variable (0 to 11) and defaults to 6.
 * Quality 10 and 11 cost an order of magnitude more CPU than 6 for a few percent smaller output,
 * which delays every streamed response.
 */
export function getBrotliQuality(): number {
  const quality = Number.parseInt(process.env.BROTLI_QUALITY ?? "", 10);
  return quality >= zlib.constants.BROTLI_MIN_QUALITY &&
    quality <= zlib.constants.BROTLI_MAX_QUALITY
    ? quality
    : DEFAULT_BROTLI_QUALITY;
}
