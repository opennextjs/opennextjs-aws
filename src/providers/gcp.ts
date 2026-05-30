import { ProviderInterface } from "./interface.js";
import { DeploymentStrategy, type BuildOutput } from "../types.js";

export class GCPProvider implements ProviderInterface {
  async deploy(buildOutput: BuildOutput, config: any): Promise<void> {
    // TODO: Implement GCP deployment logic
    console.log("Deploying to GCP");
    // This would include:
    // - Authenticating with GCP
    // - Creating/deploying Cloud Functions or Cloud Run services
    // - Managing GCP-specific resources
    // - Handling GCP configuration options
  }

  async remove(config: any): Promise<void> {
    // TODO: Implement GCP resource removal logic
    console.log("Removing GCP resources");
    // This would include:
    // - Deleting Cloud Functions
    // - Deleting Cloud Run services
    // - Cleaning up GCP resources
  }

  getDeploymentStrategy(): DeploymentStrategy {
    return DeploymentStrategy.Regional;
  }
}
