module.exports = {
  apps: [
    {
      name: 'jsonl-editor-api',
      script: 'index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'jsonl-editor-worker',
      script: 'worker-process.js',
      instances: 2, // You can scale this based on your needs
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}; 