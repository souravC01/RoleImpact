# Production deployment runbook

RoleImpact is deployed as a split application:

- the React/Vite frontend runs on Vercel;
- the Spring Boot API runs in Docker on an Oracle Cloud Ubuntu ARM VM;
- PostgreSQL runs in the dedicated `RoleImpact Production` Neon project;
- Caddy on the VM terminates TLS and is the only public API entry point.

The production API is intentionally private inside Docker. Only Caddy publishes ports `80` and `443`; it forwards requests to the API over Docker's internal network and checks `/actuator/health` before using the upstream. The API also has a separate Docker egress network solely for outbound TLS connections to Neon; it still exposes no host port.

## 1. Provision the Oracle VM

In OCI, create an Always Free-eligible Ubuntu ARM (aarch64) compute instance. A 1 OCPU / 6 GB shape gives the Java API and Docker reasonable headroom. Keep the generated SSH key private and record the public IP address.

In the OCI security list or network security group, allow only:

- TCP `22` from your own current public IP address for SSH;
- TCP `80` from `0.0.0.0/0` for the HTTP-to-HTTPS certificate flow;
- TCP `443` from `0.0.0.0/0` for the public API.

Do **not** add a public rule for TCP `8080`, PostgreSQL, or Docker's internal networks.

Connect to the server, update Ubuntu, and set the host firewall to match the OCI rules:

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y ufw ca-certificates curl git
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status numbered
```

## 2. Install Docker on Ubuntu ARM

Use Docker's official Ubuntu repository so Docker Compose v2 is installed with the engine:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
docker compose version
```

The committed API Dockerfile builds a Linux ARM64-compatible image. Do not install a local PostgreSQL instance on this VM; the API connects to Neon over TLS.

## 3. Configure DNS before TLS

Choose an API hostname, for example `api.example.com`. In your DNS provider, add an `A` record for that hostname pointing to the VM's public IPv4 address. If you configure an `AAAA` record, it must also point to a reachable IPv6 address; otherwise omit it.

Wait for DNS to resolve before starting Caddy:

```bash
dig +short api.example.com
```

Caddy obtains and renews TLS certificates automatically. Starting it before the DNS record is correct causes certificate issuance to fail or be delayed.

## 4. Place the application and production secrets

Clone the repository under the systemd service's expected directory:

```bash
sudo mkdir -p /opt/roleimpact
sudo chown "$USER":"$USER" /opt/roleimpact
git clone <your-roleimpact-repository-url> /opt/roleimpact
cd /opt/roleimpact
```

Copy the safe template, then edit the real server-only file:

```bash
cp deploy/production.env.example deploy/production.env
chmod 600 deploy/production.env
nano deploy/production.env
```

Set `API_DOMAIN`, the exact Vercel production origin in `CORS_ALLOWED_ORIGIN`, and the SSL-enabled Neon JDBC URL, username, and password. Keep `SPRING_PROFILES_ACTIVE=prod`, `DB_MAX_POOL_SIZE=5`, and `DB_MIN_IDLE=0` unless the VM capacity changes.

`deploy/production.env` is ignored by Git and must never be copied into a commit, issue, log, or chat message. It is the only place where the Neon password belongs. The Compose file maps it into the API container and gives Caddy only the public hostname it needs.

## 5. Start and persist the services

Install the boot unit, then start the stack:

```bash
sudo cp deploy/roleimpact.service /etc/systemd/system/roleimpact.service
sudo systemctl daemon-reload
sudo systemctl enable --now roleimpact
sudo systemctl status roleimpact --no-pager
docker compose --env-file deploy/production.env -f compose.prod.yml ps
```

On the first successful API start, Flyway applies the committed database migrations to the empty Neon production database. Confirm that Flyway completed successfully before using the app:

```bash
docker compose --env-file deploy/production.env -f compose.prod.yml logs api --tail=200
```

## 6. Health and smoke checks

Verify the public TLS endpoint from your computer:

```bash
curl --fail --show-error https://api.example.com/actuator/health
```

Expect an `UP` response. There must be no response from `http://<vm-public-ip>:8080` because the API is not published outside Docker.

In Vercel, set `VITE_API_BASE_URL=https://api.example.com` and redeploy the frontend. Open the deployed site, create a small test organization, refresh its saved organization URL, and run one impact test. This verifies browser CORS, persistence, URL recovery, and the impact engine through the real API.

## 7. Deploy an update

Use a reviewed commit or release tag, not an untracked local change:

```bash
cd /opt/roleimpact
git fetch origin --tags
git checkout <release-tag-or-reviewed-commit>
sudo systemctl restart roleimpact
docker compose --env-file deploy/production.env -f compose.prod.yml ps
curl --fail --show-error https://api.example.com/actuator/health
```

The systemd unit rebuilds the API image, applies any forward Flyway migrations, and restarts both containers. Check `journalctl -u roleimpact -n 100 --no-pager` and the API logs if the health endpoint does not return `UP`.

## 8. Rollback safely

If a release fails the health or smoke checks, return to the previous known-good tag or commit and restart:

```bash
cd /opt/roleimpact
git checkout <previous-known-good-tag-or-commit>
sudo systemctl restart roleimpact
curl --fail --show-error https://api.example.com/actuator/health
```

Application code and containers roll back immediately. Database migrations are forward-only: do not manually alter Neon tables during an incident. If a migration itself needs reversal, prepare a reviewed follow-up Flyway migration and deploy it normally.

## Operational checks

- `sudo ufw status` shows only SSH, `80`, and `443` allowed.
- OCI ingress matches the same rules.
- `docker compose --env-file deploy/production.env -f compose.prod.yml ps` shows both services running.
- `docker volume ls` shows the Caddy volumes; do not remove them because they retain certificates.
- `curl https://api.example.com/actuator/health` remains the single safe API health check.
