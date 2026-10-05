# Deploying PeopleOps on a shared server

This guide runs **three Docker projects on one server** (portfolio, PeopleOps, one more), each on its own hostname with automatic HTTPS. PeopleOps lives at `peopleops.farvees.xyz`.

Only one container can listen on ports 80 and 443. So a single shared **Caddy** proxy owns those ports and forwards each hostname to the right project over a shared Docker network. Projects do not run their own Caddy.

```
internet :80/:443
      │
   [ caddy ]  ── network "web" ──┬── portfolio      (farvees.xyz)
                                 ├── peopleops-app  (peopleops.farvees.xyz)
                                 └── other          (other.farvees.xyz)

peopleops-app ── private network ── mysql   (never exposed)
```

## 0. Requirements

- A Linux server with Docker and the Docker Compose plugin installed.
- At least 2 GB RAM. MySQL is capped at 512 MB, and `next build` is memory hungry, so build while the other sites are idle or add swap.
- Access to the DNS settings of `farvees.xyz`.

## 1. DNS

Add an **A record** for each hostname pointing at the server's public IP:

| Name | Type | Value |
|---|---|---|
| `peopleops.farvees.xyz` | A | server IP |
| `farvees.xyz` and `www` | A | server IP |
| `other.farvees.xyz` | A | server IP |

Check with `nslookup peopleops.farvees.xyz` before starting Caddy. It requests certificates as soon as it starts.

## 2. Firewall

Allow only SSH and web traffic. Do not open 3306 or 3000.

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
```

Note: ports published by Docker bypass `ufw`. That is why the compose files must never publish MySQL or app ports to `0.0.0.0`.

## 3. Shared network and proxy (once per server)

```bash
docker network create web
sudo mkdir -p /opt/proxy && cd /opt/proxy
```

`/opt/proxy/docker-compose.yml`:

```yaml
services:
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443", "443:443/udp"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    networks: [web]

networks:
  web:
    external: true

volumes:
  caddy-data:
  caddy-config:
```

`/opt/proxy/Caddyfile` (one block per site; match the container name and port of each project):

```
farvees.xyz, www.farvees.xyz {
	encode zstd gzip
	reverse_proxy portfolio:3000
}

peopleops.farvees.xyz {
	encode zstd gzip
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
		-Server
	}
	reverse_proxy peopleops-app:3000
}

other.farvees.xyz {
	encode zstd gzip
	reverse_proxy other:3000
}
```

Start it:

```bash
docker compose up -d
```

It will keep restarting a site's certificate request until DNS for that hostname resolves. That is harmless.

## 4. PeopleOps

### 4.1 Get the code and set the environment

```bash
git clone <repo-url> /opt/peopleops && cd /opt/peopleops
cp .env.example .env
```

Edit `.env`:

| Variable | Required | Notes |
|---|---|---|
| `SEED_DEVELOPER_PASSWORD` | **yes** | Password of the developer account. It bypasses all policies. Use a strong, secret value. Compose refuses to start without it. |
| `MYSQL_ROOT_PASSWORD` | recommended | Defaults to `devroot`. Change it. The database is never published, but do not rely on that alone. |
| `SEED_DEFAULT_PASSWORD` | no | Password of the demo accounts. Default `Demo@2026`. It is shown on the public landing page. |
| `DEMO_PASSWORD_DISPLAY` | no | Show a different password on the landing page. |
| `SEED_RESET_HR` | no | Set to `1` once to rebuild the demo company's HR data. It deletes that company's HR records. Unset it afterwards. |
| `DOMAIN` | no | Only used by the bundled Caddy (see 4.2). |

`.env` is git-ignored. Never commit it.

### 4.2 Change `docker-compose.yml` for the shared proxy

The repo's compose file bundles its own Caddy, which is right for a server that only hosts PeopleOps. On a shared server, make these changes:

1. **Delete the `caddy` service** and the `caddy-data` and `caddy-config` volumes.
2. **Attach `app` to the shared network** with a unique container name:

```yaml
  app:
    container_name: peopleops-app
    networks: [default, web]
    # ...rest unchanged

networks:
  web:
    external: true
```

Keep `mysql` and `migrate` on the default network only, so the database stays private. Container names must be unique across all projects on the `web` network, which is why `app` is renamed.

### 4.3 Build and start

```bash
docker compose up -d --build
```

What happens, in order:

1. MySQL starts and becomes healthy.
2. The `migrate` service applies all migrations, then runs the seed (roles, actions, resources, policies, demo company, demo users, 2 years of HR data). It is safe to re-run: existing users and HR data are left alone, and policies are re-synced.
3. The app starts once `migrate` has finished successfully, and reports healthy through `/api/health`.

Open `https://peopleops.farvees.xyz`. The landing page lists the demo accounts.

## 5. Day-to-day

| Task | Command |
|---|---|
| See what is running | `docker compose ps` |
| App logs | `docker compose logs -f app` |
| Migrate/seed output | `docker compose logs migrate` |
| Deploy a new version | `git pull && docker compose up -d --build` |
| Re-run only the seed (for example after a policy change) | `docker compose run --rm migrate` |
| Add a new site to the proxy | Add a block to `/opt/proxy/Caddyfile`, then `docker compose -f /opt/proxy/docker-compose.yml exec caddy caddy reload --config /etc/caddy/Caddyfile` |

New migrations are applied automatically on every `up`, because the `migrate` service runs before the app starts.

## 6. Backups

Two things hold state, both in named Docker volumes:

- `mysql-data`: the database.
- `backups`: files created from the in-app backup screen (Settings), mounted at `/data/backups`.

Take a database dump from the host on a schedule (cron) and copy it off the server:

```bash
docker compose exec -T mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction peopleops' | gzip > peopleops-$(date +%F).sql.gz
```

App backups contain password hashes. Treat the files as sensitive.

## 7. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Caddy cannot get a certificate | DNS record is missing or not propagated, or ports 80/443 are blocked. Check `docker logs <caddy>`. |
| `502 Bad Gateway` | The container name or port in the Caddyfile does not match, or the app is not on the `web` network. Check `docker network inspect web`. |
| `docker compose up` fails with `set SEED_DEVELOPER_PASSWORD` | The variable is missing from `.env`. |
| `migrate` exits with an error | Run `docker compose logs migrate`. The app will not start until it succeeds. |
| Sign-in appears to do nothing | The session cookie is `Secure`, so it only works over HTTPS. Use the `https://` address. |
| Changed `MYSQL_ROOT_PASSWORD` and now nothing connects | MySQL only reads that variable when the volume is first created. Change it inside MySQL, or remove the volume (this deletes the data). |
| Out of memory during build | Add swap, or build one project at a time. |

## 8. Security checklist

- [ ] `SEED_DEVELOPER_PASSWORD` and `MYSQL_ROOT_PASSWORD` are strong and not the examples.
- [ ] Only ports 22, 80, 443 are reachable from outside.
- [ ] The demo password is one you do not use anywhere else, because the landing page displays it.
- [ ] A database dump is taken on a schedule and stored off the server.
- [ ] The demo accounts are acceptable on a public site. HR admin can edit company policies and read the audit log.
