import {
  BatchWriteItemCommand,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import { CdkCustomResourceEvent, CdkCustomResourceResponse } from "aws-lambda";
import { readFileSync } from "fs";

const client = new DynamoDBClient({});

type DataType = {
  tag: {
    S: string;
  };
  path: {
    S: string;
  };
  revalidatedAt: {
    N: string;
  };
};

export async function handler(
  event: CdkCustomResourceEvent,
): Promise<CdkCustomResourceResponse> {
  switch (event.RequestType) {
    case "Create":
    case "Update":
      return insert();
    case "Delete":
      return remove();
  }
}

async function insert(): Promise<CdkCustomResourceResponse> {
  const file = readFileSync(`dynamodb-cache.json`, "utf8");

  const data: DataType[] = JSON.parse(file);

  // Chunk array into batches of 25
  const chunked = data.reduce((acc, curr, i) => {
    const index = Math.floor(i / 25);
    acc[index] = [...(acc[index] || []), curr];
    return acc;
  }, [] as DataType[][]);

  const TableName = process.env.CACHE_DYNAMO_TABLE!;

  const promises = chunked.map((chunk) => {
    const params = {
      RequestItems: {
        [TableName]: chunk.map((item) => ({
          PutRequest: {
            Item: item,
          },
        })),
      },
    };
    return client.send(new BatchWriteItemCommand(params));
  });

  await Promise.all(promises);

  return {
    PhysicalResourceId: "dynamodb-cache",
    Data: {},
  };
}

async function remove(): Promise<CdkCustomResourceResponse> {
  // Do we want to actually delete anything here?
  return {
    PhysicalResourceId: "dynamodb-cache",
    Data: {},
  };
}
