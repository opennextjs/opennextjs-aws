import {
  BatchWriteItemCommand,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import { CdkCustomResourceEvent, CdkCustomResourceResponse } from "aws-lambda";
import { readFileSync } from "fs";

import {
  getDynamoBatchWriteCommandConcurrency,
  MAX_DYNAMO_BATCH_WRITE_ITEM_COUNT,
} from "./constants.js";
import { chunk } from "./util.js";

const PHYSICAL_RESOURCE_ID = "dynamodb-cache";

const dynamoClient = new DynamoDBClient({});

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
  const tableName = process.env.CACHE_DYNAMO_TABLE!;

  const file = readFileSync(`dynamodb-cache.json`, "utf8");

  const data: DataType[] = JSON.parse(file);

  const dataChunks = chunk(data, MAX_DYNAMO_BATCH_WRITE_ITEM_COUNT);

  const batchWriteParamsArray = dataChunks.map((chunk) => {
    return {
      RequestItems: {
        [tableName]: chunk.map((item) => ({
          PutRequest: {
            Item: item,
          },
        })),
      },
    };
  });

  const paramsChunks = chunk(
    batchWriteParamsArray,
    getDynamoBatchWriteCommandConcurrency(),
  );

  for (const paramsChunk of paramsChunks) {
    await Promise.all(
      paramsChunk.map((params) =>
        dynamoClient.send(new BatchWriteItemCommand(params)),
      ),
    );
  }

  return {
    PhysicalResourceId: PHYSICAL_RESOURCE_ID,
    Data: {},
  };
}

async function remove(): Promise<CdkCustomResourceResponse> {
  // Do we want to actually delete anything here?
  return {
    PhysicalResourceId: PHYSICAL_RESOURCE_ID,
    Data: {},
  };
}
