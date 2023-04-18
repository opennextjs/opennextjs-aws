import "sst/node/config";
declare module "sst/node/config" {
  export interface ConfigTypes {
    APP: string;
    STAGE: string;
  }
}import "sst/node/config";
declare module "sst/node/config" {
  export interface SecretResources {
    "GITHUB_CLIENT_ID": {
      value: string;
    }
  }
}import "sst/node/config";
declare module "sst/node/config" {
  export interface SecretResources {
    "GITHUB_CLIENT_SECRET": {
      value: string;
    }
  }
}import "sst/node/site";
declare module "sst/node/site" {
  export interface NextjsSiteResources {
    "site": {
      url: string;
    }
  }
}