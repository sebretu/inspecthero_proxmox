# SYMBOL_GENERATOR_V4 — FINAL EMPIRICAL EVALUATION & RETRIEVAL REPORT

**Data:** 2026-07-24 | **Zbiór walidacyjny:** 1353 zaakceptowane cropy | **Tryb:** READ-ONLY / EXPERIMENT (Brak zmian w produkcji)

---

## 🛑 OSTATECZNA REKOMENDACJA WDROŻENIOWA

> ### **FINAL DECISION: NO**
> **`SYMBOL_GENERATOR_V4` NIE NADAFIA SIĘ DO ZASTĄPIENIA V1 W PRODUKCJI.**
> 
> Mimo że generator V4 osiągnął doskonałą jakość czyszczenia obrazu (**88.0% Visual SINGLE Rate** oraz **69.8% Target Occupancy**), jego zastosowanie w obecnym pipeline **obniżyło dokładność wyszukiwania (Precision@1) z 76.50% do 69.92%** oraz **zwiększyło liczbę błędów socket ↔ edv z 52 do 126**.

---

## 📊 ETAP 3: FULL LEAVE-ONE-OUT RETRIEVAL BENCHMARK

Test przeprowadzono dla całego zbioru 1353 zatwierdzonych symboli przy użyciu dokładnie tego samego produkcyjnego algorytmu embeddingu (768D L2-normalized vector z `generateImageEmbedding()`).

| Metryka | **V1 (Baseline Produkcja)** | **V2 (Legacy)** | **V4 (Graph Engine)** | Status V4 vs V1 |
|---|---|---|---|---|
| **Precision@1** | **76.50%** | 72.63% | **69.92%** | ❌ **Regresja (-6.58 pp)** |
| **Precision@5** | **69.03%** | 67.95% | **66.00%** | ❌ **Regresja (-3.03 pp)** |
| **Recall@10** | **1.88%** | 1.37% | **1.17%** | ❌ **Spadek (-0.71 pp)** |
| **MRR (Mean Reciprocal Rank)** | **0.8301** | 0.7996 | **0.7783** | ❌ **Spadek (-0.0518)** |
| **False Match Rate** | **23.50%** | 27.37% | **30.08%** | ❌ **Wzrost błędów (+6.58 pp)** |
| **Błędy socket → edv** | **33** | 49 | **58** | ❌ **Wzrost błędów (+25)** |
| **Błędy edv → socket** | **19** | 60 | **68** | ❌ **Wzrost błędów (+49)** |
| **Suma błędów socket ↔ edv** | **52** | 109 | **126** | ❌ **Ponad 2.4× więcej błędów** |

---

## 🚨 ETAP 4: KRYTERIA SUKCESU (CHECKLISTA WDROŻENIOWA)

Aby V4 mogło zastąpić V1 w produkcji, WSZYSTKIE poniższe warunki musiały zostać spełnione:

1. ❌ `Precision@1(V4) > Precision@1(V1)` — **69.92% vs 76.50%** (NIE SPEŁNIONE)
2. ❌ `Precision@5(V4) ≥ Precision@5(V1)` — **66.00% vs 69.03%** (NIE SPEŁNIONE)
3. ❌ `MRR(V4) > MRR(V1)` — **0.7783 vs 0.8301** (NIE SPEŁNIONE)
4. ❌ `False Match Rate(V4) < False Match Rate(V1)` — **30.08% vs 23.50%** (NIE SPEŁNIONE)
5. ❌ `Liczba błędów socket ↔ edv < V1` — **126 vs 52** (NIE SPEŁNIONE - POGORSZENIE O 142%)
6. ❌ `Brak regresji dla pozostałych klas` — **P@1 dla `cee` spadło z 48.4% do 25.8%** (NIE SPEŁNIONE)
7. ✅ `Brak zmian w danych produkcyjnych` — **SPEŁNIONE** (Wszystkie eksperymenty w trybie read-only)

---

## 📈 ETAP 5: ANALYSIS OCCUPANCY VS. PRECISION

Przeanalizowano korelację pomiędzy stopniem zajętości klatki przez symbol (Target Occupancy) a poprawnością dopasowania w klasie V4:

- **Współczynnik korelacji Pearsona (Occupancy vs P@1 correctness):** `+0.1292` (Słaba dodatnia korelacja).

### Precyzja w podziale na grupy zajętości (Occupancy Buckets):
- **0.00 – 0.20 Occupancy (Niska):** P@1 = `64.2%` (112 błędów socket↔edv)
- **0.20 – 0.60 Occupancy (Średnia):** P@1 = `68.5%`
- **0.60 – 1.00 Occupancy (Wysoka / V4 Target):** P@1 = `70.4%`

**Wniosek:** Zwiększenie rozmiaru symbolu na płótnie nie rozwiązuje problemu rozróżnialności klas przy użyciu obecnego embeddingu.

---

## 🔬 ETAP 6 & 7: FAILURE ANALYSIS & UPPER BOUND

### Dlaczego V4 pogarsza retrival mimo idealnego kadrowania?

1. **Wąskie gardło embeddingu (Heuristic 16x16 Downsampling):**
   Obecna produkcyjna funkcja `generateImageEmbedding()` przeskalowuje obraz symbolu do **siatki 16x16 pikseli**. 
   - W wersji **V1** wokół symbolu znajdowało się tło rysunku CAD (odcinki linii przewodów, sąsiednie ściany). Te elementy tła – choć szumowe wizualnie – tworzyły dla heurystycznego embeddingu unikalny "odcisk palca" otoczenia.
   - W wersji **V4** symbol jest mocno powiększony i pozbawiony tła. Po wygładzeniu i redukcji do rozdzielczości 16x16, subtelne wewnętrzne litery (np. tekst "EDV" wewnątrz gniazda) ulegają całkowitemu rozmyciu, przez co wektory 768D dla gniazd zwykłych i gniazd EDV stają się niemal **identyczne matematycznie**.
   - Skutkiem tego liczba pomyleń `socket ↔ edv` wzrosła z **52 w V1** do **126 w V4**!

2. **Teoretyczny Limit Precision@1 przy obecnym Ground Truth i Heurystyce:**
   - **Błędy w etykietach GT (63 pary wizualnie identyczne o podobieństwie > 0.90):** ograniczenie `-4.66%`
   - **Sufit heurystycznego embeddingu 16x16:** `~76.5% - 76.9%`
   - **Maksymalny teoretyczny Precision@1 (Upper Bound):** `~83.3%`

---

## 💡 CO DALEJ? (REKOMENDACJA DALSZYCH KROKÓW)

Aby osiągnąć cel **Precision@1 > 85%**, problemem **NIE JEST** sposób cropowania obrazu, lecz **model embeddingowy**:

1. **Zostawić cropowanie V1 w produkcji** (daje najlepszy retrieval 76.50% P@1 i tylko 52 błędy socket↔edv).
2. **Zastąpić heurystyczny embedding 16x16 modelem Deep Learning / Vision Transformer (ViT / ResNet)**:
   - Wysoka rozdzielczość wejściowa (224x224) pozwalająca dostrzec wewnętrzne litery "EDV".
   - Dedykowany pretraining na rysunkach CAD i symbolach technicznych.
3. **Korekta etykiet Ground Truth**: Wyczyszczenie 63 nakładających się par klasowych w bazie GT.

---

## 📁 WYGENEROWANE ARTEFAKTY EXPERYMENTU

- `v4_retrieval_benchmark.json` — Pełne metryki porównawcze V1 vs V2 vs V4
- `v4_confusion_matrix.json` — Macierze pomyłek dla wszystkich klas
- `v4_failure_analysis.json` — Kategoryzacja błędów i próby nieudanych dopasowań
- `v4_precision_vs_occupancy.json` — Dane korelacji zajętości z dokładnością
- `SYMBOL_GENERATOR_V4_FINAL_REPORT.md` — Niniejszy raport końcowy
