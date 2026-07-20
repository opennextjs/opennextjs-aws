import * as logger from "@opennextjs/aws/adapters/logger.js";
import {
  FatalError,
  IgnorableError,
  RecoverableError,
} from "@opennextjs/aws/utils/error.js";
import { vi } from "vitest";

describe("logger adapter", () => {
  const debug = vi.spyOn(console, "log").mockImplementation(() => null);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => null);
  const error = vi.spyOn(console, "error").mockImplementation(() => null);

  beforeEach(() => {
    debug.mockClear();
    warn.mockClear();
    error.mockClear();
  });

  describe("structured errors", () => {
    it("logs a message and error as a single structured object", () => {
      const cause = new Error("connection refused");
      const cacheError = Object.assign(
        new Error("The specified bucket does not exist", { cause }),
        {
          name: "NoSuchBucket",
          Code: "NoSuchBucket",
          BucketName: "cache-bucket",
          $metadata: {
            httpStatusCode: 404,
            requestId: "request-id",
          },
        },
      );

      logger.error("Failed to set cache", cacheError);

      expect(error).toHaveBeenCalledOnce();
      expect(error).toHaveBeenCalledWith({
        message: "Failed to set cache",
        error: {
          name: "NoSuchBucket",
          message: "The specified bucket does not exist",
          stack: cacheError.stack,
          cause: {
            name: "Error",
            message: "connection refused",
            stack: cause.stack,
          },
          Code: "NoSuchBucket",
          BucketName: "cache-bucket",
          $metadata: {
            httpStatusCode: 404,
            requestId: "request-id",
          },
        },
      });
    });

    it("preserves additional log details", () => {
      const thrownError = new Error("boom");

      logger.error("Failed operation", { operation: "cache.set" }, thrownError);

      expect(error).toHaveBeenCalledWith({
        message: "Failed operation",
        error: {
          name: "Error",
          message: "boom",
          stack: thrownError.stack,
        },
        details: [{ operation: "cache.set" }],
      });
    });
  });

  describe("Open Next errors", () => {
    const ignorableError = new IgnorableError("ignorable");
    const recoverableError = new RecoverableError("recoverable");
    const fatalError = new FatalError("fatal");

    it("default to warn when OPEN_NEXT_ERROR_LOG_LEVEL is undefined", () => {
      delete process.env.OPEN_NEXT_ERROR_LOG_LEVEL;
      logger.error(ignorableError);
      logger.error(recoverableError);
      logger.error(fatalError);
      expect(debug).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith("RecoverableError: recoverable");
      expect(error).toHaveBeenCalledWith(fatalError);
    });

    it("OPEN_NEXT_ERROR_LOG_LEVEL is 'debug'/'0'", () => {
      process.env.OPEN_NEXT_ERROR_LOG_LEVEL = "0";
      logger.error(ignorableError);
      logger.error(recoverableError);
      logger.error(fatalError);
      expect(debug).toHaveBeenCalledWith("IgnorableError: ignorable");
      expect(warn).toHaveBeenCalledWith("RecoverableError: recoverable");
      expect(error).toHaveBeenCalledWith(fatalError);
      process.env.OPEN_NEXT_ERROR_LOG_LEVEL = "debug";
      logger.error(ignorableError);
      logger.error(recoverableError);
      logger.error(fatalError);
      expect(debug).toHaveBeenCalledWith("IgnorableError: ignorable");
      expect(warn).toHaveBeenCalledWith("RecoverableError: recoverable");
      expect(error).toHaveBeenCalledWith(fatalError);
    });

    it("OPEN_NEXT_ERROR_LOG_LEVEL is 'warn'/'1'", () => {
      process.env.OPEN_NEXT_ERROR_LOG_LEVEL = "1";
      logger.error(ignorableError);
      logger.error(recoverableError);
      logger.error(fatalError);
      expect(debug).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith("RecoverableError: recoverable");
      expect(error).toHaveBeenCalledWith(fatalError);
      process.env.OPEN_NEXT_ERROR_LOG_LEVEL = "warn";
      logger.error(ignorableError);
      logger.error(recoverableError);
      logger.error(fatalError);
      expect(debug).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith("RecoverableError: recoverable");
      expect(error).toHaveBeenCalledWith(fatalError);
    });

    it("OPEN_NEXT_ERROR_LOG_LEVEL is 'error'/'2'", () => {
      process.env.OPEN_NEXT_ERROR_LOG_LEVEL = "2";
      logger.error(ignorableError);
      logger.error(recoverableError);
      logger.error(fatalError);
      expect(debug).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(fatalError);
      process.env.OPEN_NEXT_ERROR_LOG_LEVEL = "error";
      logger.error(ignorableError);
      logger.error(recoverableError);
      logger.error(fatalError);
      expect(debug).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(fatalError);
    });
  });
});
