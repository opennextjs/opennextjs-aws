import { OpenNextNodeResponse } from "@opennextjs/aws/http/openNextResponse.js";

function createResponse(statusCode?: number) {
  return new OpenNextNodeResponse(
    () => {},
    async () => {},
    undefined,
    undefined,
    statusCode,
  );
}

describe("OpenNextNodeResponse statusCode", () => {
  it("is undefined until a status code is set", () => {
    expect(createResponse().statusCode).toBeUndefined();
  });

  it("uses the initial status code", () => {
    expect(createResponse(404).statusCode).toBe(404);
  });

  it("can be changed before the headers are sent", () => {
    const res = createResponse();
    res.statusCode = 200;
    res.statusCode = 404;
    expect(res.statusCode).toBe(404);
  });

  it("is kept once the headers have been sent", () => {
    const res = createResponse();
    res.writeHead(304, { etag: '"abc"' });
    res.end();

    // Next.js assigns the status code again after `sendEtagResponse` ended the response
    res.statusCode = undefined as unknown as number;
    expect(res.statusCode).toBe(304);

    res.statusCode = 200;
    expect(res.statusCode).toBe(304);
  });
});
