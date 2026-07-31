module.exports = {
  apps: [
    {
      name: 'chevoink-api',
      cwd: '/opt/chevoink/app/current',
      script: 'npm',
      args: 'run start:server',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
