import { isExcluded } from "@opennextjs/aws/build/copyTracedFiles.js";

describe("isExcluded", () => {
  test("should exclude sharp", () => {
    expect(
      isExcluded(
        "/home/user/git/my-opennext-project/node_modules/sharp/lib/index.js",
      ),
    ).toBe(true);
    expect(
      isExcluded(
        "/home/user/git/my-opennext-project/node_modules/.pnpm/sharp/4.1.3/node_modules/sharp/lib/index.js",
      ),
    ).toBe(true);
    expect(
      isExcluded(
        "/home/user/git/my-opennext-project/node_modules/sharp",
      ),
    ).toBe(true);
  });

  test("should not exclude other packages", () => {
    expect(
      isExcluded(
        "/home/user/git/my-opennext-project/node_modules/other-package/lib/index.js",
      ),
    ).toBe(false);
    expect(
      isExcluded(
        "/home/user/git/my-opennext-project/node_modules/.pnpm/other-package/4.1.3/node_modules/other-package/lib/index.js",
      ),
    ).toBe(false);
    expect(
      isExcluded(
        "/home/user/git/my-opennext-project/node_modules/.pnpm/other-package/4.1.3/node_modules/sharp-other-package/lib/index.js",
      ),
    ).toBe(false);
    expect(
      isExcluded(
        "/home/user/git/my-opennext-project/node_modules/.pnpm/other-package/4.1.3/node_modules/sharp-other",
      ),
    ).toBe(false);
  });       
});
