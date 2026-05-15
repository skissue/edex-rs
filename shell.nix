{pkgs ? import <nixpkgs> {}}:
with pkgs;
mkShell {
  nativeBuildInputs = [
    nodejs_20
    node-gyp
    python311
    pkg-config
    gcc
    gnumake
    rsync
    git
    just
  ];
  buildInputs = [
    # Native module deps
    libsecret

    # Electron runtime deps
    glib
    nss
    nspr
    at-spi2-atk
    at-spi2-core
    cups
    dbus
    expat
    libdrm
    mesa
    libgbm
    libxkbcommon
    pango
    cairo
    alsa-lib
    gtk3
    gdk-pixbuf
    libnotify
    libGL
    libuuid
    libx11
    libxcomposite
    libxdamage
    libxext
    libxfixes
    libxrandr
    libxcb
    libxscrnsaver
    libxtst
    libxshmfence
  ];
  shellHook = ''
    export PYTHON=${python311}/bin/python3
    # Force npm to use the newer node-gyp from nixpkgs (the bundled v7 fails on Node 20).
    # node-pty's custom install.js shells out to `node-gyp` from PATH, so prepend
    # the nix-provided node-gyp to PATH as well.
    export npm_config_node_gyp="${node-gyp}/lib/node_modules/node-gyp/bin/node-gyp.js"
    export PATH="${node-gyp}/bin:$PATH"
    # Electron 12 ships old common.gypi referencing openssl_fips, which newer
    # gyp parsers don't resolve via the default declaration; define it explicitly.
    export npm_config_openssl_fips=""
    # Ensure native modules and electron find runtime libs
    export LD_LIBRARY_PATH="${lib.makeLibraryPath [
      glib nss nspr at-spi2-atk at-spi2-core cups dbus expat libdrm mesa libgbm
      libxkbcommon pango cairo alsa-lib gtk3 gdk-pixbuf libnotify libGL libuuid
      libx11 libxcomposite libxdamage libxext libxfixes libxrandr libxcb
      libxscrnsaver libxtst libxshmfence stdenv.cc.cc
    ]}:$LD_LIBRARY_PATH"
  '';
}
