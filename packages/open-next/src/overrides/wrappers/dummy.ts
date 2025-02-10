import type { InternalEvent, StreamCreator, WaitUntil } from "types/open-next";
import type { Wrapper, WrapperHandler } from "types/overrides";

const dummyWrapper: WrapperHandler = async (handler, converter) => {
  return async (
    event: InternalEvent,
    options?: { streamCreator?: StreamCreator; waitUntil?: WaitUntil },
  ) => {
    return await handler(event, options);
  };
};

export default {
  name: "dummy",
  wrapper: dummyWrapper,
  supportStreaming: true,
} satisfies Wrapper;
