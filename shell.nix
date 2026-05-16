{pkgs ? import <nixpkgs> {}}:
with pkgs;
mkShell {
  nativeBuildInputs = [
    nodejs_20
    node-gyp
    python311
    rustc
    cargo
    rustfmt
    clippy
    cargo-tauri
    pkg-config
    gcc
    gnumake
    rsync
    git
    just
    curl
    wget
    file
    xdg-utils
    xvfb-run
  ];
  buildInputs = [
    # Tauri runtime/build deps
    webkitgtk_4_1
    libsoup_3
    openssl
    libayatana-appindicator
    librsvg
    xdotool
    gst_all_1.gstreamer
    gst_all_1.gst-plugins-base
    gst_all_1.gst-plugins-good
    gst_all_1.gst-plugins-bad
    gst_all_1.gst-plugins-ugly
    gst_all_1.gst-libav

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
      webkitgtk_4_1 libsoup_3 openssl libayatana-appindicator librsvg xdotool
      gst_all_1.gstreamer gst_all_1.gst-plugins-base gst_all_1.gst-plugins-good
      gst_all_1.gst-plugins-bad gst_all_1.gst-plugins-ugly gst_all_1.gst-libav
      glib nss nspr at-spi2-atk at-spi2-core cups dbus expat libdrm mesa libgbm
      libxkbcommon pango cairo alsa-lib gtk3 gdk-pixbuf libnotify libGL libuuid
      libx11 libxcomposite libxdamage libxext libxfixes libxrandr libxcb
      libxscrnsaver libxtst libxshmfence stdenv.cc.cc
    ]}:$LD_LIBRARY_PATH"
    export GST_PLUGIN_SYSTEM_PATH_1_0="${lib.makeSearchPath "lib/gstreamer-1.0" [
      gst_all_1.gst-plugins-base
      gst_all_1.gst-plugins-good
      gst_all_1.gst-plugins-bad
      gst_all_1.gst-plugins-ugly
      gst_all_1.gst-libav
    ]}:$GST_PLUGIN_SYSTEM_PATH_1_0"
  '';
}
