---
"@opennextjs/aws": patch
---

fix: add early return for downplayed aws-sdk errors

In the logger adapter:

An issue was identified where downplayed errors from the aws-sdk client (f.ex NoSuchKey from S3) would not return from the function early. This caused unnecessary invocation of `console.error` outside the conditional.
