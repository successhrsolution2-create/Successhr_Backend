# EC2 Deployment Notes

Target instance: t3.small minimum, t3.medium preferred for sustained traffic.

1. Install PM2 globally:
   `npm install -g pm2`
2. Start the API:
   `pm2 start ecosystem.config.js --env production`
3. Persist PM2 on reboot:
   `pm2 startup`
   `pm2 save`
4. Copy `deploy/nginx/super-admin.conf` to `/etc/nginx/sites-available/super-admin`, update `server_name`, SSL paths, upload alias, then symlink it into `sites-enabled`.
5. Run index creation once from the backend folder:
   `node scripts/createIndexes.js`
6. Enable swap once on t3.small:
   `bash deploy/scripts/setup-swap.sh`
7. Copy `deploy/logrotate/super-admin` to `/etc/logrotate.d/super-admin`.

For t3.medium, change `node_args` to `--max-old-space-size=800` and consider `max_memory_restart: "800M"`.
