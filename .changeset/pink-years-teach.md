---
"@opennextjs/aws": patch
---

fix: Correct external URL detection in isExternal using proper URL parsing

Replaces substring-based host matching with URL parsing to correctly determine whether a rewritten URL is external.
This fixes an issue where NextResponse.rewrite() would treat certain internal URLs as external when their pathname contained the host as a substring, causing unexpected 404s during middleware rewrites.
