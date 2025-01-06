import type { InternalEvent, StreamCreator } from "types/open-next";
import type { Wrapper, WrapperHandler } from "types/overrides";

const dummyWrapper: WrapperHandler = async (handler, converter) => {
  return async (event: InternalEvent, responseStream?: StreamCreator) => {
    return await handler(event, responseStream);
  };
};

export default {
  name: "dummy",
  wrapper: dummyWrapper,
  supportStreaming: true,
} satisfies Wrapper;
