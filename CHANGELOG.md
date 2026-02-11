# Changelog

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
