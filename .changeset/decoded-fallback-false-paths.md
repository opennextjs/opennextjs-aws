---
"@opennextjs/aws": patch
---

fix: match `fallback: false` routes against the decoded pathname

A prerendered page whose path contains a percent-encoded character (e.g. a space or a non-ASCII character) used to return a 404.
