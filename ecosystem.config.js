module.exports = {
  apps: [{
    name: 'chaveiro-system',
    script: 'server.js',
    cwd: '/home/chaveiro/chaveiro-system',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: 3002
    },
    error_file: '/var/log/chaveiro/error.log',
    out_file: '/var/log/chaveiro/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
