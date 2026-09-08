module.exports = {
  apps: [
    {
      name: 'chevoink-api',
      cwd: '/opt/chevoink/app/current',
      // Launch the API itself with the pinned interpreter. An npm wrapper can
      // look correct in PM2 while its PATH-resolved child still runs system Node.
      script: 'api/server.ts',
      interpreter: process.env.CHEVOINK_NODE_BINARY || process.execPath,
      node_args: ['--import', 'tsx'],
      args: [],
      env: {
        NODE_ENV: 'production',
        PATH: process.env.PATH,
      },
    },
  ],
}
