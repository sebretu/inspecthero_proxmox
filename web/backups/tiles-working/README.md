ZŁOTY STAN – TILE VIEWER (DZIAŁA IDEALNIE)

Data: 2026-02-03

Co działa:
- Leaflet + CRS.Simple z custom Transformation (XYZ, y>=0)
- Brak blank.png
- Kafle generowane z PDF -> PNG -> tiles
- Zoom działa
- Brak ujemnych Y w requestach
- API tiles zwraca czyste 404 / 200 (bez warningów)

Kluczowe decyzje:
- CRS.Simple + new L.Transformation(1,0,1,0)
- TileLayer: tms={false}, noWrap={true}
- bounds + fitBounds po mount
- Tiles generator liczy maxX/maxY per zoom
- NIE używamy blank.png jako fallback

Jeśli coś się rozjedzie:
1. Porównać PlanViewer.tsx z backupem
2. Sprawdzić czy tms nie wróciło na true
3. Sprawdzić czy transformation się nie zmieniła
4. Sprawdzić meta.json (gridW/gridH/limits)
