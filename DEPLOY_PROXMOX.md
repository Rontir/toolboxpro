# ToolBox Pro na Proxmoxie

Najprostszy wariant lokalny to jeden LXC albo VM z Dockerem i Docker Compose.

## 1. Rekomendowany host

- Debian 12 LXC lub VM
- 2 vCPU
- 4 GB RAM
- 15-20 GB dysku

Jeśli chcesz obrabiać większe pliki Excel i obrazy, lepiej dać 4 vCPU i 6-8 GB RAM.

## 2. Instalacja Dockera

Na Debianie/Ubuntu:

```bash
apt update
apt install -y docker.io docker-compose-plugin git
systemctl enable --now docker
```

## 3. Skopiowanie projektu

```bash
git clone <twoj-repo-url> /opt/toolboxpro
cd /opt/toolboxpro
```

Albo po prostu skopiuj obecny katalog do VM/LXC.

## 4. Ustaw adres LAN

W [docker-compose.yml](/home/mike/Documents/toolboxpro/docker-compose.yml) podmień:

- `CORS_ORIGINS`
- `NEXT_PUBLIC_API_URL`

na adres Twojego hosta w Proxmoxie, na przykład:

```yaml
CORS_ORIGINS: http://192.168.1.50:3000
NEXT_PUBLIC_API_URL: http://192.168.1.50:8000
```

Jeśli chcesz dopuścić też lokalny test z przeglądarki na tym samym serwerze, zostaw dodatkowo `localhost`.

## 5. Start

```bash
docker compose up -d --build
```

Po uruchomieniu:

- frontend: `http://IP_SERWERA:3000`
- backend health: `http://IP_SERWERA:8000/api/health`

## 6. Aktualizacja

```bash
cd /opt/toolboxpro
git pull
docker compose up -d --build
```

## 7. Dane trwałe

Baza SQLite jest trzymana w volume `toolboxpro-data`.

Pliki robocze backendu są mapowane z:

- [backend/temp_processing](/home/mike/Documents/toolboxpro/backend/temp_processing)

## 8. Ograniczenia przy wdrożeniu serwerowym

Kilka funkcji w backendzie jest pisanych pod Windows desktop i nie będzie miało sensu na Proxmoxie:

- `/api/browse-folder`
- `/api/open-file`

Reszta aplikacji powinna działać normalnie, o ile nie zależy od lokalnego GUI systemu.

## 9. Reverse proxy opcjonalnie

Jeśli masz Nginx Proxy Manager, Traefika albo nginx, możesz wystawić:

- frontend na `toolbox.local`
- backend na `api.toolbox.local`

Wtedy ustaw:

```yaml
CORS_ORIGINS: http://toolbox.local,https://toolbox.local
NEXT_PUBLIC_API_URL: http://api.toolbox.local
```
