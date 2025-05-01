#!/bin/bash

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Build TypeScript code
echo "Building TypeScript code..."
npm run build

# Start the server and worker
echo "Starting server and worker..."
npm run start:all 