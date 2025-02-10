import type { InternalEvent } from "types/open-next";
import type {
  OpenNextHandlerOptions,
  Wrapper,
  WrapperHandler,
} from "types/overrides";

const dummyWrapper: WrapperHandler = async (handler, converter) => {
  return async (event: InternalEvent, options?: OpenNextHandlerOptions) => {
    return await handler(event, options);
  };
};

export default {
  name: "dummy",
  wrapper: dummyWrapper,
  supportStreaming: true,
} satisfies Wrapper;
