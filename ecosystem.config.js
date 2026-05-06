module.exports = {
  apps: [
    {
      name: "pty-gateway",
      script: "tsx",
      args: "src/index.ts",
      cwd: "/root/projects/pty-gateway",

      // Environment variables
      env: {
        NODE_ENV: "production",
        PTY_URL: "http://localhost:3000",
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
        TELEGRAM_ALLOWED_USERS: process.env.TELEGRAM_ALLOWED_USERS,
      },

      // Auto-restart configuration
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",

      // Restart on crash
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: "10s",

      // Logging
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "/var/log/pty-gateway/error.log",
      out_file: "/var/log/pty-gateway/out.log",
      merge_logs: true,

      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
    {
      name: "pty-gateway-monitor",
      script: "tsx",
      args: "src/monitor-gateway.ts",
      cwd: "/root/projects/pty-gateway",

      // Environment
      env: {
        PTY_URL: "http://localhost:3000",
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
        AUTO_RESTART: "false", // Set to true to enable auto-restart
      },

      // Cron-like restart (optional)
      cron_restart: "0 3 * * *", // Restart at 3 AM daily

      // Logging
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "/var/log/pty-gateway/monitor-error.log",
      out_file: "/var/log/pty-gateway/monitor-out.log",
    },
  ],
};
