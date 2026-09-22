# ==============================================================================
# JIT Protocol Synthesis Studio - Dockerfile
# ==============================================================================

FROM node:20-bookworm-slim

# Install system dependencies (curl, python3, bash)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    python3 \
    python3-pip \
    bash \
    build-essential \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package manifests and install dependencies
COPY package*.json tsconfig.json ./
RUN npm install

# Copy source code and assets
COPY core/ ./core/
COPY blocks/ ./blocks/
COPY compiler/ ./compiler/
COPY public/ ./public/
COPY specs/ ./specs/
COPY benchmark/ ./benchmark/
COPY bin/ ./bin/
COPY index.ts ./

# Build TypeScript to dist/
RUN npm run build && chmod +x bin/cli.js

# Expose Web Studio port
EXPOSE 3005

# Volume for user-defined Markdown specifications
VOLUME ["/app/specs"]

# Environment variables
ENV PORT=3005
ENV JIT_SPECS_DIR=/app/specs

# Start CLI dev server
CMD ["node", "bin/cli.js", "dev", "--port", "3005", "--specs", "/app/specs"]
