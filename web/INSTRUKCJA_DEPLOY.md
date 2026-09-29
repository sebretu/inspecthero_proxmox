# 📋 Instrukcja Zmian i Deploymentu – InspectHero Web

## 🗺️ Architektura środowiska

```
Twój komputer (Windows)
  │
  └──[SSH]──► Serwer: ubuntu@100.87.200.122  (Tailscale IP)
                 ~/building-task-manager/web/   ← projekt Next.js + .next/standalone
                 /tmp/build_ih_src.sh           ← skrypt pakujący Docker image
                 /tmp/inspecthero-web.tar.gz    ← wynikowy obraz Docker
                 /home/ubuntu/inspecthero-web.env  ← zmienne środowiskowe
                 /home/ubuntu/private_reports/     ← wolumen raportów
                 /home/ubuntu/private_tiles/       ← wolumen kafelków map
                 /home/ubuntu/replace.sh           ← patch kluczy Supabase
```

> ✅ Bezpośredni SSH z Twojego PC działa: `ubuntu@100.87.200.122`
> ❌ Stary build server `sebretu@100.95.155.8` – już nie istnieje

---

## 📁 Lokalne pliki źródłowe (do edycji)

Wszystkie pliki do edycji znajdują się lokalnie w:
```
C:\Users\M.Slapinski\.gemini\antigravity\scratch\src\
```

Kluczowe pliki i ich ścieżki na serwerze:

| Lokalny plik (scratch\) | Ścieżka na serwerze |
|---|---|
| `src\app\reports\AufmassPdf.tsx` | `~/building-task-manager/web/src/app/reports/AufmassPdf.tsx` |
| `src\components\aufmass\AufmassPanel.tsx` | `~/building-task-manager/web/src/components/aufmass/AufmassPanel.tsx` |
| `src\components\aufmass\AufmassEditor.tsx` | `~/building-task-manager/web/src/components/aufmass/AufmassEditor.tsx` |
| `src\components\aufmass\AufmassCanvas.tsx` | `~/building-task-manager/web/src/components/aufmass/AufmassCanvas.tsx` |
| `src\app\aufmass\[id]\AufmassSessionClient.tsx` | `~/building-task-manager/web/src/app/aufmass/[id]/AufmassSessionClient.tsx` |

---

## 🔄 Pełny Workflow – Krok po Kroku

### KROK 1 – Edytuj plik lokalnie

Edytuj plik w `C:\Users\M.Slapinski\.gemini\antigravity\scratch\src\...`

### KROK 2 – Skopiuj plik na serwer

```powershell
scp -o StrictHostKeyChecking=no `
  "C:\Users\M.Slapinski\.gemini\antigravity\scratch\src\app\reports\AufmassPdf.tsx" `
  ubuntu@100.87.200.122:"~/building-task-manager/web/src/app/reports/AufmassPdf.tsx"
```

### KROK 3 – Zbuduj Next.js (standalone)

> ⚠️ Ten krok buduje `.next/standalone` – trwa **3-8 minut**, wymaga Node.js przez Docker.

Zawsze buduj za pomocą kontenera Docker, przekazując plik środowiskowy i uruchamiając instalację z flagą `NODE_ENV=development` (aby pobrać TypeScript i devDependencies), ale sam proces budowania musi działać w trybie produkcyjnym:

```powershell
ssh -o StrictHostKeyChecking=no ubuntu@100.87.200.122 `
  "cd ~/building-task-manager/web && sudo docker run --rm --env-file /home/ubuntu/inspecthero-web.env -v /home/ubuntu/building-task-manager/web:/app -w /app node:20-alpine sh -c 'NODE_ENV=development npm install --legacy-peer-deps && npm run build'"
```

> 💡 **Ważne:** Uruchomienie całego kontenera z `-e NODE_ENV=development` spowoduje błąd podczas kompilacji Next.js: `Error: <Html> should not be imported outside of pages/_document` przy próbie generowania strony `/404`. Dlatego `NODE_ENV=development` musi być zdefiniowane tylko przed `npm install` w linii poleceń.

**Alternatywnie** – jeśli Node.js jest zainstalowany na serwerze (uwaga: obecnie na serwerze nie ma zainstalowanego Node, zaleca się budowę przez Docker powyżej):

**Oczekiwany output na końcu:**
```
✓ Compiled successfully
Route (app) ...
```

### KROK 4 – Spakuj do Docker image

```powershell
ssh -o StrictHostKeyChecking=no ubuntu@100.87.200.122 "bash /tmp/build_ih_src.sh"
```

**Oczekiwany output:**
```
=== Checking inspecthero-web standalone build ===
HAS_STANDALONE
Successfully built <hash>
Successfully tagged inspecthero-web:latest
-rw-rw-r-- 1 ubuntu ubuntu 203M ... /tmp/inspecthero-web.tar.gz
IH_BUILD_DONE
```

> ⚠️ Jeśli widzisz `NO_STANDALONE` – najpierw zrób KROK 3 (build Next.js).

### KROK 5 – Załaduj i uruchom nowy kontener

```powershell
ssh -o StrictHostKeyChecking=no ubuntu@100.87.200.122 `
  "gunzip -c /tmp/inspecthero-web.tar.gz | sudo docker load && sudo docker stop inspecthero-web && sudo docker rm inspecthero-web && sudo docker run -d --name inspecthero-web --restart unless-stopped -p 3005:3005 -v /home/ubuntu/private_reports:/app/private_reports -v /home/ubuntu/private_tiles:/app/private_tiles --env-file /home/ubuntu/inspecthero-web.env inspecthero-web:latest"
```

### KROK 6 – Uruchom patch kluczy (ZAWSZE po restarcie)

```powershell
ssh -o StrictHostKeyChecking=no ubuntu@100.87.200.122 "bash /home/ubuntu/replace.sh"
```

### KROK 7 – Zweryfikuj

```powershell
ssh -o StrictHostKeyChecking=no ubuntu@100.87.200.122 "sudo docker logs inspecthero-web"
```

**Oczekiwany output:**
```
▲ Next.js 16.1.6
✓ Starting...
✓ Ready in 140ms
```

---

## ⚡ Szybki Deploy – Wszystko w Jednym Bloku

Użyj gdy **zmieniasz tylko kod TSX** (nie zmieniasz package.json ani zależności):

```powershell
# === KONFIGURACJA ===
$SERVER = "ubuntu@100.87.200.122"
$SCRATCH = "C:\Users\M.Slapinski\.gemini\antigravity\scratch"

# === 1. Skopiuj zmienione pliki (dopasuj do tego co edytowałeś) ===
scp -o StrictHostKeyChecking=no "$SCRATCH\src\app\reports\AufmassPdf.tsx" "${SERVER}:~/building-task-manager/web/src/app/reports/AufmassPdf.tsx"
scp -o StrictHostKeyChecking=no "$SCRATCH\src\components\aufmass\AufmassPanel.tsx" "${SERVER}:~/building-task-manager/web/src/components/aufmass/AufmassPanel.tsx"
scp -o StrictHostKeyChecking=no "$SCRATCH\src\components\aufmass\AufmassEditor.tsx" "${SERVER}:~/building-task-manager/web/src/components/aufmass/AufmassEditor.tsx"

# === 2. Build Next.js standalone ===
# (pomiń ten krok jeśli .next/standalone jest aktualne)
ssh -o StrictHostKeyChecking=no $SERVER "cd ~/building-task-manager/web && npm run build 2>&1 | tail -20"

# === 3. Spakuj do Docker image ===
ssh -o StrictHostKeyChecking=no $SERVER "bash /tmp/build_ih_src.sh"

# === 4. Deploy kontenera ===
ssh -o StrictHostKeyChecking=no $SERVER "gunzip -c /tmp/inspecthero-web.tar.gz | sudo docker load && sudo docker stop inspecthero-web && sudo docker rm inspecthero-web && sudo docker run -d --name inspecthero-web --restart unless-stopped -p 3005:3005 -v /home/ubuntu/private_reports:/app/private_reports -v /home/ubuntu/private_tiles:/app/private_tiles --env-file /home/ubuntu/inspecthero-web.env inspecthero-web:latest"

# === 5. Patch kluczy ===
ssh -o StrictHostKeyChecking=no $SERVER "bash /home/ubuntu/replace.sh"

# === 6. Weryfikacja ===
ssh -o StrictHostKeyChecking=no $SERVER "sudo docker ps | grep inspecthero && sudo docker logs inspecthero-web 2>&1 | tail -5"
```

---

## 🐛 Rozwiązywanie Problemów

### `NO_STANDALONE` – brak `.next/standalone`
Build Next.js nie był uruchomiony lub się nie udał. Uruchom pełny build:
```powershell
ssh -o StrictHostKeyChecking=no ubuntu@100.87.200.122 "cd ~/building-task-manager/web && npm run build 2>&1 | tail -30"
```

### Błąd kompilacji TypeScript
Sprawdź pełne błędy build logu:
```powershell
ssh -o StrictHostKeyChecking=no ubuntu@100.87.200.122 "cat ~/building-task-manager/web/build.log 2>/dev/null | grep -E 'error|Error' | head -20"
```

### Kontener nie startuje
```powershell
ssh -o StrictHostKeyChecking=no ubuntu@100.87.200.122 "sudo docker logs --tail 30 inspecthero-web"
```

### Sprawdź status wszystkich kontenerów
```powershell
ssh -o StrictHostKeyChecking=no ubuntu@100.87.200.122 "sudo docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
```

### PostgREST schema cache (po migracji DB)
```powershell
ssh -o StrictHostKeyChecking=no ubuntu@100.87.200.122 "sudo docker exec supabase-db psql -U postgres -c \"NOTIFY pgrst, 'reload schema';\""
```

---

## 📌 Ważne Uwagi dla Agentów

1. **Serwer dostępny bezpośrednio**: `ubuntu@100.87.200.122` – brak jump hosta, SSH działa prosto z Windows.
2. **Build script `/tmp/build_ih_src.sh`** – pakuje istniejący `.next/standalone` do Docker image. Nie buduje Next.js od zera – do tego potrzebny jest `npm run build`.
3. **Patch kluczy jest OBOWIĄZKOWY** – po każdym nowym kontenerze uruchom `bash /home/ubuntu/replace.sh`.
4. **Wolumeny są krytyczne** – zawsze uruchamiaj kontener z:
   - `-v /home/ubuntu/private_reports:/app/private_reports`
   - `-v /home/ubuntu/private_tiles:/app/private_tiles`
5. **Env file**: `/home/ubuntu/inspecthero-web.env` – zawiera klucze Supabase, OpenAI, Telegram itp.
6. **Kolejność**: edycja → SCP → `npm run build` → `build_ih_src.sh` → `docker load+run` → `replace.sh`

---

## 🗂️ Struktura Kluczowych Plików Next.js

```
~/building-task-manager/web/src/
├── app/
│   ├── aufmass/
│   │   └── [id]/
│   │       └── AufmassSessionClient.tsx   ← lista zdjęć, mapa, nawigacja
│   └── reports/
│       └── AufmassPdf.tsx                 ← generowanie PDF Aufmaß
├── components/
│   └── aufmass/
│       ├── AufmassEditor.tsx              ← edytor rysunków na zdjęciach
│       ├── AufmassPanel.tsx               ← panel materiałów i robocizny
│       ├── AufmassCanvas.tsx              ← kanwa do rysowania
│       └── AufmassToolbar.tsx             ← pasek narzędzi edytora
└── pages/
    └── api/
        └── aufmass/
            ├── sessions/                  ← API sesji
            ├── materials/                 ← API materiałów
            ├── labor/                     ← API robocizny
            ├── versions/                  ← API wersji/rysunków
            └── markers/                   ← API markerów na mapie
```

---

## 🔑 Dostępy SSH

| Serwer | Adres | Login | Klucz |
|---|---|---|---|
| Serwer aplikacji (VM 200) | `100.87.200.122` | `ubuntu` | `C:\Users\M.Slapinski\.ssh\id_ed25519` |

> Stary serwer build `sebretu@100.95.155.8` już nie istnieje.
