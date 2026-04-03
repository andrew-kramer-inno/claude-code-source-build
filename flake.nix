{
  description = "Nix flake for building the Claude Code source build";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };

        nodejs = pkgs.nodejs_22;

        buildCli = pkgs.writeShellApplication {
          name = "build-claude-code";
          runtimeInputs = [
            nodejs
            pkgs.bun
          ];
          text = ''
            set -euo pipefail

            if [ ! -f ./scripts/build-cli.mjs ]; then
              echo "Run this from the repository root so ./scripts/build-cli.mjs is available." >&2
              exit 1
            fi

            exec node ./scripts/build-cli.mjs "$@"
          '';
        };
      in
      {
        packages.default = buildCli;
        packages.build-cli = buildCli;

        apps.default = {
          type = "app";
          program = "${buildCli}/bin/build-claude-code";
        };

        apps.build = {
          type = "app";
          program = "${buildCli}/bin/build-claude-code";
        };

        apps.build-dev = {
          type = "app";
          program = "${pkgs.writeShellApplication {
            name = "build-claude-code-dev";
            runtimeInputs = [
              nodejs
              pkgs.bun
            ];
            text = ''
              set -euo pipefail

              if [ ! -f ./scripts/build-cli.mjs ]; then
                echo "Run this from the repository root so ./scripts/build-cli.mjs is available." >&2
                exit 1
              fi

              exec node ./scripts/build-cli.mjs --no-minify "$@"
            '';
          }}/bin/build-claude-code-dev";
        };

        devShells.default = pkgs.mkShell {
          packages = [
            nodejs
            pkgs.bun
          ];

          shellHook = ''
            echo "Tooling loaded: node $(node --version), npm $(npm --version), bun $(bun --version)"
            echo "Build with: node scripts/build-cli.mjs"
            echo "Or via flake app: nix run .#build"
          '';
        };
      });
}
