module.exports = {
  apps: [
    {
      name: 'super-admin-api',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-old-space-size=400',
      max_memory_restart: '400M',
      watch: false,
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      error_file: 'logs/err.log',
      out_file: 'logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      restart_delay: 3000
    }
  ]
}
