---
"@opennextjs/aws": patch
---

fix: keep the status code of a response once its headers have been sent

Next.js assigns `res.statusCode` again after it ended a `304 Not Modified` response for a matching `If-None-Match` header. In buffered mode (i.e. Lambda@Edge) this reset the status to `200` while the body was empty, so browsers rendered a blank page. Like on a native Node.js response, the status code can no longer be changed after the headers have been sent.
