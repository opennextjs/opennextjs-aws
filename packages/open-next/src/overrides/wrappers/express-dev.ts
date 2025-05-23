import path from "node:path";
import express from "express";

import { NextConfig } from "config/index";
import type { StreamCreator } from "types/open-next.js";
import type { WrapperHandler } from "types/overrides.js";
import { getMonorepoRelativePath } from "utils/normalize-path";

const wrapper: WrapperHandler = async (handler, converter) => {
  const app = express();
  // To serve static assets
  const basePath = NextConfig.basePath ?? "";
  app.use(
    basePath,
    express.static(path.join(getMonorepoRelativePath(), "assets")),
  );

  const imageHandlerPath = path.join(
    getMonorepoRelativePath(),
    "image-optimization-function/index.mjs",
  );

  const imageHandler = await import(imageHandlerPath).then((m) => m.handler);

  app.all(`${NextConfig.basePath ?? ""}/_next/image`, async (req, res) => {
    const internalEvent = await converter.convertFrom(req);
    const streamCreator: StreamCreator = {
      writeHeaders: (prelude) => {
        res.writeHead(prelude.statusCode, prelude.headers);
        return res;
      },
    };
    await imageHandler(internalEvent, { streamCreator });
  });

  app.all("*paths", async (req, res) => {
    const internalEvent = await converter.convertFrom(req);
    const streamCreator: StreamCreator = {
      writeHeaders: (prelude) => {
        res.setHeader("Set-Cookie", prelude.cookies);
        res.writeHead(prelude.statusCode, prelude.headers);
        res.flushHeaders();
        return res;
      },
      onFinish: () => {},
    };
    await handler(internalEvent, { streamCreator });
  });

  const server = app.listen(
    Number.parseInt(process.env.PORT ?? "3000", 10),
    () => {
      console.log(`Server running on port ${process.env.PORT ?? 3000}`);
    },
  );

  app.on("error", (err) => {
    console.error("error", err);
  });

  return () => {
    server.close();
  };
};

export default {
  wrapper,
  name: "expresss-dev",
  supportStreaming: true,
};
