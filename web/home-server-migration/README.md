# Przewodnik Migracji na Serwer Domowy (Ubuntu)

Ten folder zawiera pliki i instrukcje potrzebne do przeniesienia Twojej aplikacji Building Task Manager oraz bazy danych Supabase na własny serwer.

## Wymagania
- Serwer z systemem Ubuntu (np. 22.04 LTS lub nowszy).
- Dostęp administratora (root/sudo).
- Zainstalowany `git`.
- Domena internetowa (dla konfiguracji Cloudflare Tunnel).

## Krok 1: Instalacja Docker i Docker Compose

Zaloguj się na swój serwer i wykonaj poniższe komendy, aby zainstalować środowisko Docker:

```bash
# Aktualizacja pakietów
sudo apt-get update
sudo apt-get install -y ca-certificates curl

# Dodanie klucza GPG Dockera
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Dodanie repozytorium
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Instalacja
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Weryfikacja
sudo docker run hello-world
```

## Krok 2: Uruchomienie Supabase (Self-Hosting)

Supabase udostępnia oficjalną konfigurację Docker. Najlepiej sklonować ich repozytorium.

1.  **Sklonuj repozytorium Supabase:**
    ```bash
    # Przejdź do katalogu domowego
    cd ~
    git clone --depth 1 https://github.com/supabase/supabase
    cd supabase/docker
    ```

2.  **Konfiguracja zmiennych środowiskowych:**
    Skopiuj przykładowy plik `.env`:
    ```bash
    cp .env.example .env
    ```

    **WAŻNE:** Edytuj plik `.env` i zmień domyślne hasła oraz klucze API!
    - `POSTGRES_PASSWORD`: Hasło do bazy danych.
    - `JWT_SECRET`: Sekret do generowania tokenów.
    - `ANON_KEY`, `SERVICE_ROLE_KEY`: Klucze API (musisz je wygenerować na nowo pasujące do `JWT_SECRET`).
    - `DASHBOARD_USERNAME`, `DASHBOARD_PASSWORD`: Dane logowania do Supabase Studio.

    *Możesz użyć strony https://supabase.com/docs/guides/self-hosting/docker#generating-api-keys aby wygenerować poprawne klucze JWT.*

3.  **Uruchomienie:**
    ```bash
    docker compose up -d
    ```

    Teraz Twoje Supabase działa:
    - Studio: `http://localhost:54323` (lub `http://<ip-serwera>:54323`)
    - API: `http://localhost:8000`
    - Baza Danych: Port `54322`

## Krok 3: Migracja Danych

Musisz przenieść dane ze starej bazy (w chmurze) do nowej (na serwerze).

1.  **Zrzut danych (Dump) ze zdalnej bazy:**
    Na swoim komputerze (tam gdzie masz projekt) użyj `pg_dump`. Potrzebujesz `connection string` do zdalnej bazy.
    ```bash
    pg_dump "postgres://postgres:[HASLO]@db.project-id.supabase.co:5432/postgres" \
      --clean --if-exists --quote-all-identifiers \
      --exclude-schema=extensions --exclude-schema=vault \
      > dump.sql
    ```

2.  **Import danych na serwerze:**
    Wyślij plik `dump.sql` na serwer i zaimportuj go do lokalnego Supabase.
    ```bash
    # Na serwerze (będąc w folderze supabase/docker)
    cat dump.sql | docker compose exec -T db psql -U postgres
    ```

## Krok 4: Uruchomienie Aplikacji Webowej

Możesz uruchomić aplikację bezpośrednio używając Node.js i PM2 lub w Dockerze. Tutaj opiszę metodę z PM2 (prostsza do zarządzania na start).

1.  **Instalacja Node.js (wersja 20 lub 22):**
    ```bash
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    sudo npm install -g pm2
    ```

2.  **Skopiowanie plików aplikacji:**
    Przenieś folder `web` ze swojego projektu na serwer (np. do `~/app`).
    ```bash
    # Przykład rsync z Twojego komputera
    rsync -avz --exclude 'node_modules' --exclude '.next' ./web user@<ip-serwera>:~/app
    ```

3.  **Konfiguracja:**
    Na serwerze w folderze `~/app`:
    - Stwórz `.env.local` na podstawie `.env.example`.
    - Ustaw `NEXT_PUBLIC_SUPABASE_URL` na `https://api.twoja-domena.com` (jeśli używasz Cloudflare) lub `http://localhost:8000`.
    - Ustaw `NEXT_PUBLIC_SUPABASE_ANON_KEY` na ten sam klucz co w `.env` Supabase.

4.  **Budowanie i start:**
    ```bash
    cd ~/app
    npm install
    npm run build
    pm2 start npm --name "building-app" -- start
    pm2 save
    pm2 startup
    ```

## Krok 5: Nginx i Cloudflare Tunnel

Aby bezpiecznie wystawić aplikację na świat bez otwierania portów.

### Opcja A: Cloudflare Tunnel (Zalecana)
Cloudflare Tunnel tworzy bezpieczne połączenie z sieci Cloudflare do Twojego serwera.

1.  **Zainstaluj cloudflared:**
    ```bash
    curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    sudo dpkg -i cloudflared.deb
    ```

2.  **Zaloguj się:**
    ```bash
    cloudflared tunnel login
    ```

3.  **Utwórz tunel:**
    ```bash
    cloudflared tunnel create building-server
    ```

4.  **Skonfiguruj DNS:**
    Przypisz domeny do tunelu:
    ```bash
    cloudflared tunnel route dns building-server twoja-domena.com
    cloudflared tunnel route dns building-server api.twoja-domena.com
    cloudflared tunnel route dns building-server studio.twoja-domena.com
    ```

5.  **Konfiguracja (config.yml):**
    Edytuj plik konfiguracyjny (zazwyczaj w `~/.cloudflared/config.yml`):
    ```yaml
    tunnel: <Tunnel-UUID>
    credentials-file: /home/user/.cloudflared/<Tunnel-UUID>.json

    ingress:
      # Aplikacja WWW
      - hostname: twoja-domena.com
        service: http://localhost:3000
      # Supabase API
      - hostname: api.twoja-domena.com
        service: http://localhost:8000
      # Supabase Studio
      - hostname: studio.twoja-domena.com
        service: http://localhost:54323
      # Domyślna zasada (404 dla reszty)
      - service: http_status:404
    ```

6.  **Uruchom tunel:**
    ```bash
    cloudflared tunnel run building-server
    # Lub zainstaluj jako usługę systemową:
    sudo cloudflared service install
    ```

### Opcja B: Nginx (Reverse Proxy) + SSL
Jeśli wolisz tradycyjne podejście (wymaga otwarcia portów 80/443 na routerze).

1.  Zainstaluj Nginx: `sudo apt install nginx`
2.  Skopiuj załączony plik `nginx.conf` do `/etc/nginx/sites-available/building-app`.
3.  Utwórz link symboliczny: `sudo ln -s /etc/nginx/sites-available/building-app /etc/nginx/sites-enabled/`.
4.  Zrestartuj Nginx: `sudo systemctl restart nginx`.
5.  Użyj **Certbot** do wygenerowania certyfikatów SSL (Let's Encrypt).
