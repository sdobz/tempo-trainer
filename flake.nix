{
  description = "Tempo Trainer - Browser-based drum training";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          name = "tempo-trainer-dev";

          buildInputs = with pkgs; [
            deno
            typescript
            nodePackages.prettier
            nodePackages.eslint
            nodePackages.http-server
          ];

          shellHook = ''
            echo "🥁 Tempo Trainer Development Environment"
            echo ""
            echo "Tools available:"
            echo "  deno       $(deno --version | head -n 1)"
            echo "  tsc        $(tsc --version)"
            echo "  prettier   $(prettier --version)"
            echo "  eslint     $(eslint --version)"
            echo ""
            echo "Commands:"
            echo "  ./tools/test           - Run component tests (Deno)"
            echo "  ./tools/check          - Type check (TypeScript)"
            echo "  ./tools/format         - Format code (Prettier)"
            echo "  ./tools/lint           - Lint code (ESLint)"
            echo "  ./tools/serve          - Dev server on localhost:8080"
            echo ""
          '';
        };
      }
    );
}
