Wklej CAŁOŚĆ 👇
# Tiles – working reference (backup & restore)

Ten dokument opisuje **działający, sprawdzony stan systemu kafelków (tiles)**,
który poprawnie obsługuje:
- CRS.Simple (Leaflet)
- poprawne bounds
- zoom in / zoom out
- brak białych kafelków
- brak ujemnych (x/y < 0) requestów

---

## ✅ Stan referencyjny

- **Git tag:** `tiles-working-2026-02-03`
- **Data:** 2026-02-03
- **Status:** PRODUKCYJNIE SPRAWDZONE – NIE RUSZAĆ bez backupu

---

## 📁 Kluczowe pliki

Te pliki **muszą być spójne ze sobą**:

- `web/src/components/PlanViewer.tsx`
- `web/src/pages/api/tiles/[planId]/[z]/[x]/[y].png.ts`
- `web/scripts/generate-tiles.mjs`
- `web/public/tiles/<PLAN_ID>/meta.json`

---

## 🔁 Przywracanie z GIT (NAJLEPSZE)

### Szybki powrót do działającego stanu
```bash
git checkout tiles-working-2026-02-03

Utworzenie branch’a do dalszej pracy
git checkout -b restore-tiles-working tiles-working-2026-02-03

🧯 Przywracanie z backupu TAR (offline / awaryjne)
Sprawdź zawartość:
tar -tzf backups/tiles-working-20260203_183247.tar.gz

Przywróć pliki:
tar -xzf backups/tiles-working-20260203_183247.tar.gz -C /


⚠️ Uwaga: nadpisuje pliki w web/

🧪 Test po przywróceniu
curl -I http://localhost:3000/api/tiles/<PLAN_ID>/5/0/0.png
curl -I http://localhost:3000/api/tiles/<PLAN_ID>/5/26/38.png


Oczekiwane:

HTTP/1.1 200 OK


A to musi być 404:

curl -I http://localhost:3000/api/tiles/<PLAN_ID>/1/26/-39.png

🛑 Zasady na przyszłość (WAŻNE)

❗ ZANIM zmienisz cokolwiek w tiles:

./backups/backup-tiles-working.sh


❗ Jeśli:

pojawiają się białe kafelki

zoom przestaje działać

Leaflet strzela w minusowe Y

➡️ wróć do tego tagu i porównuj diff

git diff tiles-working-2026-02-03

🧠 Dlaczego to działa

CRS.Simple

tms={true}

bounds liczone w pixelach zoom=0

brak wrapX / wrapY

API tiles NIE generuje kafelków w locie – tylko serwuje istniejące

🔒 Motto

„Jeśli tiles działają – najpierw backup, potem myślenie”


Zapisz i wyjdź: **Ctrl+O → Enter → Ctrl+X**

---

## 2️⃣ Dodaj do gita i zapisz historię

```bash
cd ~/building-task-manager
git add docs/tiles-working.md
git commit -m "docs: add tiles working backup & restore instructions"
git push origin main

3️⃣ (Opcjonalnie) Link w głównym README

Jeśli chcesz, w README.md dodaj np.:

## Tiles / Plan Viewer

➡️ Zobacz: [docs/tiles-working.md](docs/tiles-working.md)  
(opis działającego stanu, backup i restore)
