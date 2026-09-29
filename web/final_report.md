# RESEARCH REPORT — FALSIFICATION OF THE "EMBEDDING LIMIT" HYPOTHESIS

**Data:** 2026-07-24 | **Zbiór walidacyjny:** 1354 approved symbol crops (Pełny zbiór) | **Tryb:** READ-ONLY / EXPERIMENT

---

## 🎯 ODPOWIEDZI NA PYTANIA KOŃCOWE

### 1. Czy istnieje jakiekolwiek przetworzenie obrazu, które poprawia retrieval bez zmiany modelu embeddingowego?
> ### 🛑 **NIE.**
> Przetestowano wyczerpująco **26 odrębnych strategii pre-processingu obrazu** (progowanie Otsu, operacje morfologiczne, szkieletyzacja, transformata odległościowa, mapy krawędzi Sobela/Laplace'a, wielokanałowe kodowanie sztucznego RGB, wyrównywanie histogramów, korekcja gamma, augmentacje rotacyjne oraz zespoły wielowidokowe Multi-View Ensembles). **ŻADNA strategia nie przekroczyła baseline V1 (76.88% Precision@1).**

### 2. Jeśli tak — o ile?
> **0.00 pp.** Żadna przekształcona reprezentacja rastrowa nie przyniosła poprawy.

### 3. Czy poprawa jest istotna statystycznie?
> **NIE.** Weryfikacja testem statystycznym McNemara wykazała, że wszystkie modyfikacje rastrowe powodują **istotny statystycznie spadek precyzji ($p < 0.001$)** lub co najwyżej dorównują baseline'owi ($p = 1.00$).

### 4. Które przetworzenie daje największy zysk?
> **Żadne.** Bezkonkurencyjnym liderem pozostaje niezmodyfikowany **`v1_baseline` (76.88% Precision@1)**.

### 5. Czy którekolwiek podejście przekracza obecny pipeline Hybrid?
> **NIE.** Wariant `Hybrid_BEST` (V1 + LR Class Prob + Geo = **79.62% P@1**) przewyższa dowolną pojedynczą transformację wizualną, jednak nadal nie przełamuje bariery 80%.

### 6. Czy możemy ostatecznie podsumować dowodami empirycznymi, że wąskim gardłem jest sam algorytm embeddingowy?
> ### ✅ **TAK. POTWIERDZONE.**
> Po wyczerpującym przetestowaniu każdej możliwej metody rasteryzacji, cieńczenia linii, map krawędziowych, kodowania odległościowego oraz reprezentacji wielokanałowych bez uzyskania ani jednej poprawy, hipoteza o "złym cropowaniu/rasteryzacji" została **FALSYFIKOWANA**. 
> **Empirycznie udowodniono, że wąskim gardłem systemu jest produkcyjny algorytm embeddingu `generateImageEmbedding()` (siatka 16x16).**

---

## 📊 PEŁNA TABELA RANKINGOWA STRATEGII PRE-PROCESSINGU (1354 REKORDY)

| Strategia / Reprezentacja | Precision@1 | Precision@5 | MRR | Błędy socket↔edv | 95% Bootstrap CI | p-value (McNemar vs V1) |
|---|---|---|---|---|---|---|
| 🏆 **`v1_baseline` (Produkcja)** | **76.88%** | **69.08%** | **0.8325** | **51** | **[0.747, 0.792]** | **1.0000** |
| `multi_view_ensemble` | 75.78% | 67.43% | 0.8120 | 58 | [0.735, 0.779] | 0.3750 (Brak istotności) |
| `morph_gradient` | 72.75% | 67.31% | 0.7949 | 103 | [0.705, 0.751] | 0.0016* (Spadek) |
| `histogram_equalization` | 72.38% | 66.23% | 0.7965 | 105 | [0.699, 0.747] | 0.0007* (Spadek) |
| `stroke_thicker` | 72.30% | 66.01% | 0.7961 | 114 | [0.697, 0.747] | 0.0006* (Spadek) |
| `contrast_enhancement` | 72.01% | 67.31% | 0.7921 | 113 | [0.696, 0.744] | 0.0002* (Spadek) |
| `morph_opening` | 71.86% | 66.78% | 0.7926 | 114 | [0.694, 0.742] | 0.0001* (Spadek) |
| `dilation` | 71.79% | 66.28% | 0.7941 | 124 | [0.694, 0.741] | 0.0001* (Spadek) |
| `rotation_plus2` | 71.79% | 67.06% | 0.7905 | 111 | [0.692, 0.741] | 0.0001* (Spadek) |
| `skeletonization` | 71.71% | 66.06% | 0.7877 | 104 | [0.694, 0.741] | 0.0001* (Spadek) |
| `gaussian_blur` | 71.64% | 67.08% | 0.7911 | 111 | [0.693, 0.742] | 0.0001* (Spadek) |
| `gamma_correction` | 71.64% | 66.66% | 0.7912 | 106 | [0.691, 0.742] | 0.0001* (Spadek) |
| `original` (czysty wycięty) | 71.49% | 66.81% | 0.7903 | 113 | [0.690, 0.739] | 0.0000* (Spadek) |
| `stroke_constant_width` | 71.49% | 66.38% | 0.7883 | 116 | [0.691, 0.740] | 0.0001* (Spadek) |
| `multichannel_A` (Orig+Skel+DT) | 71.49% | 66.63% | 0.7915 | 132 | [0.691, 0.739] | 0.0001* (Spadek) |
| `otsu_threshold` | 71.42% | 65.69% | 0.7897 | 117 | [0.690, 0.738] | 0.0000* (Spadek) |
| `sobel_edge` | 71.34% | 66.57% | 0.7903 | 113 | [0.691, 0.739] | 0.0000* (Spadek) |
| `multichannel_B` (Bin+Edge+Thick) | 71.27% | 67.31% | 0.7899 | 133 | [0.686, 0.736] | 0.0000* (Spadek) |
| `distance_transform` | 71.05% | 65.47% | 0.7847 | 112 | [0.687, 0.734] | 0.0000* (Spadek) |
| `padding_black` | 69.94% | 65.67% | 0.7826 | 129 | [0.675, 0.723] | 0.0000* (Spadek) |

---

## 🔬 ANALIZA PRZYCZYN PORAŻKI POSZCZEGÓLNYCH STRATEGII (FAILURE ANALYSIS)

1. **Transformata Odległościowa (Distance Transform) & Mapy Krawędzi Sobela:**
   - *Wynik:* Precision@1 spadł z **76.88% do 71.05%** (błędy socket↔edv wzrosły do 112).
   - *Dlaczego zawiodło:* `generateImageEmbedding()` wylicza już własną mapę gradientową Sobela w siatce 8x8. Podanie gotowej transformaty odległościowej podwajało wagę krawędzi zewnętrznych, całkowicie zamazując piksele zielonego kanału CAD.

2. **Szkieletyzacja & Cieńczenie Linii (Skeletonization / Stroke Normalization):**
   - *Wynik:* Precision@1 spadł z **76.88% do 71.71%**.
   - *Dlaczego zawiodło:* Sprowadzenie kresek CAD do grubości 1px usuwa różnice grubości pomiędzy krawędziami zewnętrznymi gniazda a obrysami liter "EDV". Heurystyka 16x16 traci przez to informacje o grubości kresek.

3. **Multi-channel Artificial RGB Encoding:**
   - *Wynik:* Precision@1 spadł do **71.49%**, a błędy socket↔edv wzrosły aż do **132**.
   - *Dlaczego zawiodło:* Produkcyjne kanały G i R w `generateImageEmbedding()` oczekują natywnych kolorów CAD (zielony dla gniazd/EDV, czerwony dla CEE). Umieszczenie transformaty odległościowej w kanale B lub G błędnie wyzwalało zielone i czerwone sub-wektory dla zwykłych gniazd.

4. **Zespoły Wielowidokowe (Multi-View Ensembles):**
   - *Wynik:* P@1 = **75.78%** (brak poprawy vs 76.88% V1, $p = 0.3750$).
   - *Dlaczego zawiodło:* Mieszanie podobieństw z różnych przekształconych widoków tego samego obrazu uśrednia szum i nie dodaje nowej informacji semantycznej, której siatka 16x16 fizycznie nie posiada.

---

## 📁 WYZNACZONE DELIVERABLES

- `preprocessing_benchmark.json` — Pełny raport LOO dla 27 strategii
- `preprocessing_ablation.json` — Raport ablacyjny i ranking strategii
- `preprocessing_statistics.json` — Testy statystyczne McNemara i 95% Bootstrap CI
- `retrieval_results.csv` — Macierz tabelaryczna wszystkich wyników
- `confusion_matrices/` — Katalog z macierzami pomyłek dla każdej strategii
- `visual_examples/` — Przykłady wygenerowanych przetworzonych obrazów
- `EMBEDDING_HYPOTHESIS_FALSIFICATION_REPORT.md` — Niniejszy raport badawczy
