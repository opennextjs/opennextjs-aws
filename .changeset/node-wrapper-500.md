---
"@opennextjs/aws": patch
---

fix: answer a request that fails in the `node` wrapper with a 500

A failure while converting or handling a request was an unhandled rejection, which crashed the server and every concurrent request. The `node` and `aws-web-function` wrappers now share one server implementation that answers 500, or destroys the response once its headers were sent.
