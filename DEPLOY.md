# Deploying on an OCI VM (Docker)

## Before you start
1. VM: Ubuntu 22.04/24.04 (ARM Ampere A1 works; images are built natively).
2. DNS: create an **A record** for your domain pointing to the VM's public IP.
3. OCI Console: add **ingress rules for TCP 80 and 443** to the subnet's Security List (or NSG).

## Install
```bash
git clone <your-repo-url> eakos && cd eakos
./install.sh
```
It installs Docker if missing, writes `.env` with generated secrets, opens the VM firewall, builds, starts, and prints your admin login once.

## Update
```bash
./update.sh          # backup -> git pull -> rebuild -> migrate -> health check -> auto rollback
```
Database migrations run automatically on container start (`prisma migrate deploy`).

## Operations
| Task | Command |
|---|---|
| Logs | `docker compose logs -f app` |
| Status | `docker compose ps` |
| Manual backup | `docker compose exec -T db pg_dump -U eakos eakos \| gzip > backups/manual.sql.gz` |
| Restore | `./restore.sh backups/<db>.sql.gz [backups/documents-<stamp>.tar.gz]` |
| Restart | `docker compose restart app` |

Nightly backups land in `./backups` (newest 14 kept). Copy them off the VM (OCI Object Storage, rclone, etc.) — a backup on the same disk is not a disaster-recovery plan.

## Develop a new schema change
```bash
npx prisma migrate dev --name describe_change   # locally, commit prisma/migrations/*
git push   # then on the VM: ./update.sh
```

## Employee documents (private files)

Uploaded HR documents are stored in the `docdata` Docker volume (`/data/documents` in the app container), never in the web root. The nightly backup service also writes `backups/documents-*.tar.gz`. `./restore.sh backups/<db>.sql.gz backups/documents-<stamp>.tar.gz` restores the database and the documents together (use files from the same night). With only the database file it restores the database and warns that documents were not restored. It always saves the current database to `backups/pre-restore-<stamp>.sql.gz` first. See `docs/ROLLOUT.md` for the pre-launch checklist and rollback table.
