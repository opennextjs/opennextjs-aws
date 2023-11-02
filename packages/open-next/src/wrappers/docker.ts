import { createServer } from "http";

import { ResponseStream } from "../adapters/http";
import { Wrapper } from "../adapters/types/open-next";

const wrapper: Wrapper = async (handler, converter) => {
  const server = createServer(async (req, res) => {
    const internalEvent = converter.convertFrom(req);
    const _res = res as any as ResponseStream;

    _res["writeHeaders"] = (prelude, onFinish) => {
      res.writeHead(prelude.statusCode, prelude.headers);
      res.uncork();
      onFinish();
    };

    await handler(internalEvent, _res);
  });

  server.listen(3000);

  return () => {
    server.close();
  };
};

export default wrapper;
