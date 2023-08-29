import { isBinaryContentType } from "@open-next/utils";

describe("isBinaryContentType", () => {
  const tests = [
    { type: "application/octet-stream", binary: true },
    // Docs
    { type: "application/epub+zip", binary: true },
    { type: "application/msword", binary: true },
    { type: "application/pdf", binary: true },
    { type: "application/rtf", binary: true },
    { type: "application/vnd.amazon.ebook", binary: true },
    { type: "application/vnd.ms-excel", binary: true },
    { type: "application/vnd.ms-powerpoint", binary: true },
    {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      binary: true,
    },
    {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      binary: true,
    },
    {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      binary: true,
    },
    // Fonts
    { type: "font/otf", binary: true },
    { type: "font/woff", binary: true },
    { type: "font/woff2", binary: true },
    // Images
    { type: "image/bmp", binary: true },
    { type: "image/gif", binary: true },
    { type: "image/jpeg", binary: true },
    { type: "image/png", binary: true },
    { type: "image/tiff", binary: true },
    { type: "image/vnd.microsoft.icon", binary: true },
    { type: "image/webp", binary: true },
    // Audio
    { type: "audio/3gpp", binary: true },
    { type: "audio/aac", binary: true },
    { type: "audio/basic", binary: true },
    { type: "audio/mpeg", binary: true },
    { type: "audio/ogg", binary: true },
    { type: "audio/wavaudio/webm", binary: true },
    { type: "audio/x-aiff", binary: true },
    { type: "audio/x-midi", binary: true },
    { type: "audio/x-wav", binary: true },
    // Video
    { type: "video/3gpp", binary: true },
    { type: "video/mp2t", binary: true },
    { type: "video/mpeg", binary: true },
    { type: "video/ogg", binary: true },
    { type: "video/quicktime", binary: true },
    { type: "video/webm", binary: true },
    { type: "video/x-msvideo", binary: true },
    // Archives
    { type: "application/java-archive", binary: true },
    { type: "application/vnd.apple.installer+xml", binary: true },
    { type: "application/x-7z-compressed", binary: true },
    { type: "application/x-apple-diskimage", binary: true },
    { type: "application/x-bzip", binary: true },
    { type: "application/x-bzip2", binary: true },
    { type: "application/x-gzip", binary: true },
    { type: "application/x-java-archive", binary: true },
    { type: "application/x-rar-compressed", binary: true },
    { type: "application/x-tar", binary: true },
    { type: "application/x-zip", binary: true },
    { type: "application/zip", binary: true },
    // False

    { type: "text/plain", binary: false },
    { type: "text/html", binary: false },
    { type: "text/css", binary: false },
    { type: "text/javascript", binary: false },
    { type: "or", binary: false },
    { type: "application/javascript", binary: false },
    { type: "application/json", binary: false },
    { type: "application/xml", binary: false },
    { type: "application/x", binary: false },
    { type: "www", binary: false },
    { type: "form", binary: false },
    { type: "urlencoded", binary: false },
    { type: "text/xml", binary: false },
    { type: "application/x", binary: false },
    { type: "yaml", binary: false },
    { type: "text/markdown", binary: false },
    { type: "text/csv", binary: false },
    { type: "text/richtext", binary: false },
    { type: "text/x", binary: false },
    { type: "python", binary: false },
    { type: "text/x", binary: false },
    { type: "java", binary: false },
    { type: "source", binary: false },
    { type: "text/x", binary: false },
    { type: "csrc", binary: false },
    { type: "application/xhtml", binary: false },
    { type: "xml", binary: false },
    { type: "application/msgpack", binary: false },
    { type: "application/cbor", binary: false },
    { type: "application/properties", binary: false },
    { type: "application/yaml", binary: false },
  ];

  tests.forEach(({ type, binary }) => {
    it(`${type} should be ${binary}`, () => {
      const result = isBinaryContentType(type);
      expect(result).toEqual(binary);
    });
  });
});
