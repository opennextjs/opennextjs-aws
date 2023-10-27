import { hasCacheExtension } from "../../open-next/src/adapters/cache";

describe("hasCacheExtension", () => {
  it("Should returns true if has an extension and it is a CacheExtension", () => {
    expect(hasCacheExtension("hello.json")).toBeTruthy();
  });

  it("Should return false if does not have any extension", () => {
    expect(hasCacheExtension("hello,json")).toBeFalsy();
  });
});
