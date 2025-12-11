---
"@opennextjs/aws": patch
---

Bump Next and React to fix vulnerabilities (CVE-2025-55184 and CVE-2025-55183)

Note that Next 13 has been removed from the allowed peer Dependency range,
because it is vulnerable under specific conditions.

If possible we will check the conditions at build time and relax the peer dependency.

See <https://react.dev/blog/2025/12/11/denial-of-service-and-source-code-exposure-in-react-server-components>
See <https://nextjs.org/blog/security-update-2025-12-11>
