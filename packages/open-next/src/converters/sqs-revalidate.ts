import { SQSEvent } from "aws-lambda";
import { Converter } from "types/open-next";

import { RevalidateEvent } from "../adapters/revalidate";

const converter: Converter<RevalidateEvent, RevalidateEvent> = {
  convertFrom(event: SQSEvent) {
    const records = event.Records.map((record) => {
      const { host, url } = JSON.parse(record.body);
      return { host, url, id: record.messageId };
    });
    return Promise.resolve({
      type: "revalidate",
      records,
    });
  },
  convertTo(revalidateEvent) {
    return Promise.resolve({
      type: "revalidate",
      batchItemFailures: revalidateEvent.records.map((record) => ({
        itemIdentifier: record.id,
      })),
    });
  },
  name: "sqs-revalidate",
};

export default converter;
