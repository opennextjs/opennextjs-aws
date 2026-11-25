import { validateConfig } from "@opennextjs/aws/build/validateConfig.js";
import logger from "@opennextjs/aws/logger.js";
import type { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("validateConfig", () => {
  beforeEach(() => {
    vi.spyOn(logger, "warn").mockImplementation(() => {});
    vi.spyOn(logger, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const configWith = (wrapper: string, converter: string) =>
    ({
      default: { override: { wrapper, converter } },
    }) as unknown as OpenNextConfig;

  it("warns that aws-lambda-streaming does not work behind API Gateway v2", () => {
    validateConfig(configWith("aws-lambda-streaming", "aws-apigw-v2"));

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("API Gateway HTTP API (v2)"),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("does not warn for the aws-apigw-streaming wrapper", () => {
    validateConfig(configWith("aws-apigw-streaming", "aws-apigw-v1"));

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs an error for an incompatible wrapper and converter", () => {
    validateConfig(configWith("aws-lambda-streaming", "aws-apigw-v1"));

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("not compatible"),
    );
  });
});
