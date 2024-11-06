import type { Converter } from "types/overrides";

type DummyEventOrResult = {
  type: "dummy";
  original: any;
};

const converter: Converter<DummyEventOrResult, DummyEventOrResult> = {
  convertFrom(event) {
    return Promise.resolve({
      type: "dummy",
      original: event,
    });
  },
  convertTo(internalResult) {
    return Promise.resolve({
      type: "dummy",
      original: internalResult,
    });
  },
  name: "dummy",
};

export default converter;
