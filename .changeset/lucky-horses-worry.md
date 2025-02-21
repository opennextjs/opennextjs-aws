---
"@opennextjs/aws": patch
---

add: s3 lite override for loading images in the image optimization server

`s3-lite` override for image loading. Uses `aws4fetch` to get the objects from your s3 bucket. This will make the image optimization server work without the aws s3 sdk. This override introduces a new environment variable called `BUCKET_REGION`. It will fallback to `AWS_DEFAULT_REGION` if undefined. This will require no additional change in IAC for most users.

```ts
import type { OpenNextConfig } from '@opennextjs/aws/types/open-next';
const config = {
  default: {},
   imageOptimization: {
     loader: 's3-lite', 
   },
} satisfies OpenNextConfig;

export default config;
```