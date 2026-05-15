default: run

# Install root and src dependencies, then rebuild node-pty for Electron
install:
    npm install
    cd src && npm install
    ./node_modules/.bin/electron-rebuild -f -w node-pty

# Launch the app
run:
    npm start

# Full clean build & run from scratch
build: install run

# Install Tauri scaffold dependencies
tauri-install:
    cd edex-ui-tauri && npm install

# Build the Tauri app without Linux package bundling
tauri-build:
    cd edex-ui-tauri && npm run tauri build -- --no-bundle

# Launch the Tauri app in development mode
tauri-run:
    cd edex-ui-tauri && npm run tauri dev

# Build and launch the compiled Tauri binary
tauri-run-release: tauri-build
    cd edex-ui-tauri && ./src-tauri/target/release/edex-ui-tauri

# Wipe installed dependencies
clean:
    rm -rf node_modules src/node_modules
