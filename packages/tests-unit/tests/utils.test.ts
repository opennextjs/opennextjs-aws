import { fixSWRCacheHeader } from "@open-next/utils";

describe("Utils", () => {
  describe("fixSWRCacheHeader", () => {
    it("Does not update swr if already set", () => {
      const headers = {
        "cache-control": "maxage=69,stale-while-revalidate=11",
      };
      fixSWRCacheHeader(headers);

      expect(headers).toEqual({
        "cache-control": "maxage=69,stale-while-revalidate=11",
      });
    });

    it("Does not add swr if not exists", () => {
      const headers = {
        "cache-control": "maxage=69",
      };
      fixSWRCacheHeader(headers);

      expect(headers).toEqual({
        "cache-control": "maxage=69",
      });
    });

    it("Sets time on swf if not defined", () => {
      const headers = {
        "cache-control": "maxage=69,stale-while-revalidate",
      };
      fixSWRCacheHeader(headers);

      expect(headers).toEqual({
        "cache-control": "maxage=69,stale-while-revalidate=2592000",
      });
    });
  });
});
