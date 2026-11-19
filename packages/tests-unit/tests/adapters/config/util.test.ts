import { getOpenNextBuildId } from "@opennextjs/aws/adapters/config/util.js";

describe("getOpenNextBuildId", () => {
  it("should use the deployment id when set", () => {
    expect(getOpenNextBuildId({ deploymentId: "dpl-1" }, "build-id")).toBe(
      "dpl-1",
    );
  });

  it("should fall back to the build id when the deployment id is not set", () => {
    expect(getOpenNextBuildId({}, "build-id")).toBe("build-id");
  });

  it("should fall back to the build id when the deployment id is empty", () => {
    // Next writes an empty deploymentId when `experimental.runtimeServerDeploymentId` is enabled
    expect(getOpenNextBuildId({ deploymentId: "" }, "build-id")).toBe(
      "build-id",
    );
  });
});
