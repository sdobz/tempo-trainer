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
          ];

          shellHook = ''
            echo "🥁 Tempo Trainer Development Environment"
            echo ""
            echo "Tools available:"
            echo "  deno       $(deno --version | head -n 1)"
            echo ""
            echo "Commands:"
            echo "  ./tools/test           - Run tests + type check (Deno)"
            echo "  ./tools/check          - Type check (Deno)"
            echo "  ./tools/format         - Format code (Deno)"
            echo "  ./tools/lint           - Lint code (Deno)"
            echo "  ./tools/serve          - Dev server on localhost:8080 (Deno)"
            echo "  ./tools/bundle         - Bundle for production"
            echo ""
          '';
        };
      }
    );
}
