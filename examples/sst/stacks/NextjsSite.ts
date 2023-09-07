import { NextjsSite as SSTNextSite } from "sst/constructs";
// NOTE: Temporary class to add streaming
export class NextjsSite extends SSTNextSite {
  protected supportsStreaming(): boolean {
    return true;
  }
}
