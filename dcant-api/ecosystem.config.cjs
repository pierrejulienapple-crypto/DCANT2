// PM2 configuration — déploiement sur le VPS
module.exports = {
  apps: [{
    name: 'dcant-api',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    max_memory_restart: '512M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/var/log/dcant/error.log',
    out_file: '/var/log/dcant/out.log',
    merge_logs: true
  }]
};
