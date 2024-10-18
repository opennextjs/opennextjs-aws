import { WrapperHandler } from "types/open-next";

const dummyWrapper: WrapperHandler = async () => {
  return async () => {
    return;
  };
};

export default {
  name: "dummy",
  handler: dummyWrapper,
  supportStreaming: false,
};
