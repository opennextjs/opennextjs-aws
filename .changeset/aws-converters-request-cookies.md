---
"@opennextjs/aws": patch
---

fix: parse request cookies from the cookie header in the AWS converters

The `aws-cloudfront`, `aws-apigw-v1` and `aws-apigw-v2` converters now parse the cookie header with the `cookie` package, like the `node` and `edge` converters. Cookie `has`/`missing` conditions and the `NEXT_LOCALE` cookie now work with these converters.
