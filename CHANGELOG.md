# Changelog

# [0.4.0](https://github.com/BartWaardenburg/spaceship-mcp/compare/v0.3.0...v0.4.0) (2026-11-27)

### Features

* move to MCP TypeScript SDK v2 and spec 2026-07-28 ([#33](https://github.com/BartWaardenburg/spaceship-mcp/issues/33)) ([21dd0db](https://github.com/BartWaardenburg/spaceship-mcp/commit/21dd0db7780cf27a0dada65756302eda5c200fce))

# [0.3.0](https://github.com/BartWaardenburg/spaceship-mcp/compare/v0.2.4...v0.3.0) (2026-02-11)


### Bug Fixes

* **ci:** correct coverage upload path to match vitest output ([dcfd0a1](https://github.com/BartWaardenburg/spaceship-mcp/commit/dcfd0a1e362d4ce59c1634ae53ae984c56b2a749))
* improve error messages with actionable recovery suggestions ([#15](https://github.com/BartWaardenburg/spaceship-mcp/issues/15)) ([19d9bfc](https://github.com/BartWaardenburg/spaceship-mcp/commit/19d9bfcb0b2c2dacf12a55b6b1ca82d5ef43adad)), closes [#2](https://github.com/BartWaardenburg/spaceship-mcp/issues/2)


### Features

* add Completions API for argument auto-complete ([#24](https://github.com/BartWaardenburg/spaceship-mcp/issues/24)) ([2f4e176](https://github.com/BartWaardenburg/spaceship-mcp/commit/2f4e1761536826673e88be9d047d1b56319a3b75))
* add Docker image for containerized distribution ([#22](https://github.com/BartWaardenburg/spaceship-mcp/issues/22)) ([29b356c](https://github.com/BartWaardenburg/spaceship-mcp/commit/29b356cf91e1f5e014ebccce19e9beef53e26459))
* add dynamic tool loading via search/describe/execute meta-tools ([#26](https://github.com/BartWaardenburg/spaceship-mcp/issues/26)) ([783e3d6](https://github.com/BartWaardenburg/spaceship-mcp/commit/783e3d67b56e4506a0ec06bcc018c402007e9123))
* add MCP Prompts for guided workflows ([#18](https://github.com/BartWaardenburg/spaceship-mcp/issues/18)) ([46890ae](https://github.com/BartWaardenburg/spaceship-mcp/commit/46890ae5e7d838ffe0fb01049ab0231b96838929)), closes [#5](https://github.com/BartWaardenburg/spaceship-mcp/issues/5)
* add MCP Resources for passive context loading ([#17](https://github.com/BartWaardenburg/spaceship-mcp/issues/17)) ([61015b9](https://github.com/BartWaardenburg/spaceship-mcp/commit/61015b98d7c7a09f976e767158bc780bb6a58f86)), closes [#4](https://github.com/BartWaardenburg/spaceship-mcp/issues/4)
* add outputSchema to all tool definitions ([#16](https://github.com/BartWaardenburg/spaceship-mcp/issues/16)) ([b1c5b07](https://github.com/BartWaardenburg/spaceship-mcp/commit/b1c5b07a567712c7966e57d05290c9fcd1cdd043)), closes [#3](https://github.com/BartWaardenburg/spaceship-mcp/issues/3)
* add rate limit handling with exponential backoff ([#21](https://github.com/BartWaardenburg/spaceship-mcp/issues/21)) ([cfd1323](https://github.com/BartWaardenburg/spaceship-mcp/commit/cfd13232e7e8b323e4e6a8bc540b36e80cfd43dd))
* add resource subscriptions for real-time change notifications ([#25](https://github.com/BartWaardenburg/spaceship-mcp/issues/25)) ([e329068](https://github.com/BartWaardenburg/spaceship-mcp/commit/e3290681f0944da48ed563cf051d12392573ad13))
* add response caching with TTL and automatic invalidation ([#20](https://github.com/BartWaardenburg/spaceship-mcp/issues/20)) ([c9fbf48](https://github.com/BartWaardenburg/spaceship-mcp/commit/c9fbf485a1d48ea66cccdcef32521e26b2d0cbf8))
* add smithery.yaml for Smithery registry distribution ([#14](https://github.com/BartWaardenburg/spaceship-mcp/issues/14)) ([c2af5cf](https://github.com/BartWaardenburg/spaceship-mcp/commit/c2af5cf67a8656b8aea3c94e17ca80be3155d189)), closes [#1](https://github.com/BartWaardenburg/spaceship-mcp/issues/1)
* implement toolset filtering to reduce context window usage ([#19](https://github.com/BartWaardenburg/spaceship-mcp/issues/19)) ([99a4161](https://github.com/BartWaardenburg/spaceship-mcp/commit/99a41617c4cd7053c7c5dc1a3dc75994346592fa)), closes [#6](https://github.com/BartWaardenburg/spaceship-mcp/issues/6)
* publish HTML coverage report to GitHub Pages ([aa5fe5d](https://github.com/BartWaardenburg/spaceship-mcp/commit/aa5fe5d9e604b73fc69feb1c7bcc5c14ddb7b12d))

## [0.2.4](https://github.com/BartWaardenburg/spaceship-mcp/compare/v0.2.3...v0.2.4) (2026-02-11)


### Bug Fixes

* align API implementation with OpenAPI spec and add CI workflow ([029a9d3](https://github.com/BartWaardenburg/spaceship-mcp/commit/029a9d35dfc61557dbe7bcd544e538433eafc92e))
* **ci:** add packageManager field for pnpm/action-setup ([900c761](https://github.com/BartWaardenburg/spaceship-mcp/commit/900c7614d319574d356af8460a67f1724634137f))
* **ci:** run vitest directly to ensure coverage output ([42440c2](https://github.com/BartWaardenburg/spaceship-mcp/commit/42440c294b76629a8e6716c343de5584ba47432b))
* correct username casing in coverage badge URL ([3d965ff](https://github.com/BartWaardenburg/spaceship-mcp/commit/3d965ffc44e9596a519ac5b051d180f5569bf4e4))
* remove unused ContactsSchema, fix postalCode nullish handling, improve sellerhub messaging ([ab73b3a](https://github.com/BartWaardenburg/spaceship-mcp/commit/ab73b3a58e2f34341d57003d46a5c8a15a82979c))

## [0.2.3](https://github.com/BartWaardenburg/spaceship-mcp/compare/v0.2.2...v0.2.3) (2026-02-11)


### Bug Fixes

* correct mcpName casing and update registry schema ([d79d3d5](https://github.com/BartWaardenburg/spaceship-mcp/commit/d79d3d5df955ab26c751d506d22942f6ab9c72e4))

## [0.2.2](https://github.com/BartWaardenburg/spaceship-mcp/compare/v0.2.1...v0.2.2) (2026-02-11)

## [0.2.1](https://github.com/BartWaardenburg/spaceship-mcp/compare/v0.2.0...v0.2.1) (2026-02-11)


### Bug Fixes

* auto-delete conflicting DNS records before saving ([45ef3f9](https://github.com/BartWaardenburg/spaceship-mcp/commit/45ef3f95dfcc102aff5dd93f96a62d16b494c1c3))

# 0.2.0 (2026-02-11)


### Bug Fixes

* access nameservers.hosts instead of nameservers directly ([5dd7558](https://github.com/BartWaardenburg/spaceship-mcp/commit/5dd7558520cd4bd734e06098ea0c106dd004bdf5))


### Features

* add domain lifecycle, contacts, sellerhub, personal nameservers and fix API payloads ([9488661](https://github.com/BartWaardenburg/spaceship-mcp/commit/9488661750c94995dbc295d6fd8831962897bd1c))
* add spaceship dns check mcp server ([47f47f8](https://github.com/BartWaardenburg/spaceship-mcp/commit/47f47f8a9038579d01d20686c94627add6430329))
* add support for all DNS record types and tests ([e43ef0a](https://github.com/BartWaardenburg/spaceship-mcp/commit/e43ef0acba498cc83bae449b952d0c0422df079d))
