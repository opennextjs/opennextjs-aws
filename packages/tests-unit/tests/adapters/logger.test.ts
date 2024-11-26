import * as logger from "@opennextjs/aws/adapters/logger.js";
import {
  FatalError,
  IgnorableError,
  RecoverableError,
} from "@opennextjs/aws/utils/error.js";
import { vi } from "vitest";

describe("logger adapter", () => {
  describe("Open Next errors", () => {
    const debug = vi.spyOn(console, "log").mockImplementation(() => null);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => null);
    const error = vi.spyOn(console, "error").mockImplementation(() => null);

    beforeEach(() => {
      debug.mockClear();
      warn.mockClear();
      error.mockClear();
    });

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
