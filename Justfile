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

# Wipe installed dependencies
clean:
    rm -rf node_modules src/node_modules
