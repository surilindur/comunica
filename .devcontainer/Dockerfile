FROM mcr.microsoft.com/devcontainers/typescript-node:26

# Corepack has been decoupled from Node itself, and needs to be installed separately
RUN apt-get update && apt-get install -y --no-install-recommends node-corepack && corepack enable && rm -rf /var/lib/apt/lists/*
