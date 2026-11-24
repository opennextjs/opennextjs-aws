---
"@opennextjs/aws": patch
---

fix: answer a 500 when the response head can not be written in the `node` and `express-dev` wrappers

A response with an invalid header, e.g. a Pages API route setting a header value containing a newline before `res.send()`, was never answered: `TypeError [ERR_INVALID_CHAR]: Invalid character in header content` was logged and the request stayed pending until the client gave up. It is now answered with a 500 that keeps the headers set before the invalid one, like `next start` does.
