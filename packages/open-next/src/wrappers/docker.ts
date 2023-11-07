import { createServer } from "http";

import { StreamCreator } from "../adapters/http/openNextResponse";
import { Wrapper } from "../adapters/types/open-next";

const wrapper: Wrapper = async (handler, converter) => {
  const server = createServer(async (req, res) => {
    const internalEvent = converter.convertFrom(req);
    const _res: StreamCreator = {
      writeHeaders: (prelude) => {
        res.writeHead(prelude.statusCode, prelude.headers);
        res.uncork();
        return res;
      },
    };

    await handler(internalEvent, _res);
  });

  server.listen(3000);

  return () => {
    server.close();
  };
};

export default wrapper;
