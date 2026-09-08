module.exports = {
  apps: [
    {
      name: 'chevoink-api',
      cwd: '/opt/chevoink/app/current',
      script: 'npm',
      interpreter: process.env.CHEVOINK_NODE_BINARY || process.execPath,
      args: 'run start:server',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
