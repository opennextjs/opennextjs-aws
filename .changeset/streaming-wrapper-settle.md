---
"@opennextjs/aws": patch
---

aws-lambda-streaming: wait for the response stream to settle before returning, so the sandbox cannot freeze ahead of the terminal chunk and wedge CDN origin connections; also handle compressor stream errors, which pipe() does not forward
