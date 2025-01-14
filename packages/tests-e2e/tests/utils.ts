import { createHash } from "node:crypto";

export function validateMd5(data: Buffer, expectedHash: string) {
  return createHash("md5").update(data).digest("hex") === expectedHash;
}
