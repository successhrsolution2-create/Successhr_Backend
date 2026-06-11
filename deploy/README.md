# EC2 Deployment Notes

Target instance: t3.small minimum, t3.medium preferred for sustained traffic.

1. Install PM2 globally:
   `npm install -g pm2`
2. On the EC2 server, make sure every production-only secret exists:

   ```sh
   cd /opt/successhr/app
   [ -f .env ] && cp .env ".env.bak.$(date +%Y%m%d%H%M%S)"

   printf "\nEMS_REFRESH_SECRET=%s\nCOMPANY_ADMIN_JWT_SECRET=%s\nBACKUP_JWT_SECRET=%s\nBACKUP_DOWNLOAD_SECRET=%s\n" \
     "$(openssl rand -hex 48)" \
     "$(openssl rand -hex 48)" \
     "$(openssl rand -hex 48)" \
     "$(openssl rand -hex 48)" >> .env

   pm2 restart successhr-backend --update-env
   pm2 logs successhr-backend --lines 50
   ```

3. If this is the first deploy and PM2 says the process does not exist, start the API:
   `pm2 start ecosystem.config.js --env production`
4. Persist PM2 on reboot:
   `pm2 startup`
   `pm2 save`
5. Copy `deploy/nginx/super-admin.conf` to `/etc/nginx/sites-available/super-admin`, update `server_name`, SSL paths, upload alias, then symlink it into `sites-enabled`.
   Do not add `Access-Control-Allow-*` headers in Nginx for `/api/` or `/crm/`; Express already sends CORS headers.
6. Run index creation once from the backend folder:
   `node scripts/createIndexes.js`
7. Enable swap once on t3.small:
   `bash deploy/scripts/setup-swap.sh`
8. Copy `deploy/logrotate/super-admin` to `/etc/logrotate.d/super-admin`.

For t3.medium, change `node_args` to `--max-old-space-size=800` and consider `max_memory_restart: "800M"`.
