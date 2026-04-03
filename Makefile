.PHONY: help build dev build-dev test run clean clean-workspace rebuild rebuild-dev nix-build nix-build-dev nix-develop

NODE ?= node
NIX ?= nix
BUILD_SCRIPT := scripts/build-cli.mjs
DIST_ENTRY := dist/cli.js
PREPARED_MARKER := .cache/workspace/.prepared.json

help: ## Show available workflow targets
	@printf "Available targets:\n"
	@awk 'BEGIN {FS = ":.*## "}; /^[a-zA-Z0-9_-]+:.*## / {printf "  %-14s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build the production bundle with the flake-managed Node/Bun toolchain
	$(NIX) run path:.#build

dev: ## Build an unminified development bundle with the flake-managed toolchain
	$(NIX) run path:.#build-dev

build-dev: ## Alias for the development build
	$(NIX) run path:.#build-dev

test: build ## Build and smoke-test the generated CLI
	test -f $(DIST_ENTRY)
	$(NIX) develop path:. --command node $(DIST_ENTRY) --help >/dev/null

run: ## Run the built CLI from dist/cli.js with the local Node binary
	$(NODE) $(DIST_ENTRY)

clean: ## Remove build output
	rm -rf dist

clean-workspace: ## Remove cached extracted workspace and output
	rm -rf .cache/workspace dist

rebuild: clean build ## Clean dist and rebuild production bundle

rebuild-dev: ## Force workspace regeneration and rebuild unminified bundle
	rm -f $(PREPARED_MARKER)
	$(NIX) run path:.#build-dev

nix-build: ## Build through the flake app
	$(NIX) run path:.#build

nix-build-dev: ## Development build through the flake app
	$(NIX) run path:.#build-dev

nix-develop: ## Enter the flake dev shell
	$(NIX) develop path:.
