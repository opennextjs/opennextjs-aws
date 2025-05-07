import path from "node:path";
import express from "express";

import type { StreamCreator } from "types/open-next.js";
import type { WrapperHandler } from "types/overrides.js";

const outputDir = path.join(
  globalThis.monorepoPackagePath
    .split("/")
    .filter(Boolean)
    .map(() => "../")
    .join(""),
  "../../",
);

const wrapper: WrapperHandler = async (handler, converter) => {
  const app = express();
  // To serve static assets
  app.use(express.static(path.join(outputDir, "assets")));

  const imageHandlerPath = path.join(
    outputDir,
    "image-optimization-function/index.mjs",
  );

  const imageHandler = await import(imageHandlerPath).then((m) => m.handler);

  app.all("/_next/image", async (req, res) => {
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
