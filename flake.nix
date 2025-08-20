{
  description = "CodSpeed Node development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
        commonBuildInputs = with pkgs; [
          # Needed for node-gyp
          (python314.withPackages (
            ps: with ps; [
              setuptools
            ]
          ))
        ];

      in
      {
        devShells = {
          default = pkgs.mkShell {
            buildInputs = commonBuildInputs;
            shellHook = ''
              echo "CodSpeed Node development environment"
            '';
          };

          lsp = pkgs.mkShell {
            buildInputs =
              with pkgs;
              [
                typescript-language-server
              ]
              ++ commonBuildInputs;
            shellHook = ''
              echo "CodSpeed Node development environment with LSP"
            '';
          };
        };
      }
    );
}
