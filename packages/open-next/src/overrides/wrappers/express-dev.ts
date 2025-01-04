// dev/wrapper.ts
// You'll need to install express
import express from "express";

import type { StreamCreator } from "types/open-next.js";
import type { WrapperHandler } from "types/overrides.js";

const wrapper: WrapperHandler = async (handler, converter) => {
  const app = express();
  // To serve static assets
  app.use(express.static("../../assets"));

  const imageHandlerPath = "../../image-optimization-function/index.mjs";
  const imageHandler = await import(imageHandlerPath).then((m) => m.handler);

  app.all("/_next/image", async (req, res) => {
    const internalEvent = await converter.convertFrom(req);
    const _res: StreamCreator = {
      writeHeaders: (prelude) => {
        res.writeHead(prelude.statusCode, prelude.headers);
        return res;
      },
      onFinish: () => {},
    };
    await imageHandler(internalEvent, _res);
  });

  app.all("*paths", async (req, res) => {
    const internalEvent = await converter.convertFrom(req);
    const _res: StreamCreator = {
      writeHeaders: (prelude) => {
        res.writeHead(prelude.statusCode, prelude.headers);
        return res;
      },
      onFinish: () => {},
    };
    await handler(internalEvent, _res);
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
