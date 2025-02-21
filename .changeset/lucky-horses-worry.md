---
"@opennextjs/aws": patch
---

add: s3 lite override for loading images in the image optimization server

`s3-lite` override for image loading. Uses `aws4fetch` to get the objects from your s3 bucket. This will make the image optimization server work without the aws s3 sdk. Important to note that a new environment variable is required on the image optimization server for this override to work: `BUCKET_REGION`.

```ts
import type { OpenNextConfig } from '@opennextjs/aws/types/open-next';
const config = {
  default: {},
   imageOptimization: {
     loader: 's3-lite', // make sure you have the required env variables defined
   },
} satisfies OpenNextConfig;

export default config;
```