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
            nodejs_20
            typescript
            nodePackages.prettier
            nodePackages.eslint
            esbuild
          ];

          shellHook = ''
            echo "🥁 Tempo Trainer Development Environment"
            echo ""
            echo "Tools available:"
            echo "  node       $(node --version)"
            echo "  tsc        $(tsc --version)"
            echo "  prettier   $(prettier --version)"
            echo "  eslint     $(eslint --version)"
            echo "  esbuild    $(esbuild --version)"
            echo ""
            echo "Commands:"
            echo "  nix flake update       - Update flake.lock"
            echo "  ./scripts/check        - Type check"
            echo "  ./scripts/format       - Format code"
            echo "  ./scripts/lint         - Lint code"
            echo "  ./scripts/serve        - Dev server on localhost:8080"
            echo "  ./scripts/bundle       - Production bundle"
            echo ""
          '';
        };
      }
    );
}
