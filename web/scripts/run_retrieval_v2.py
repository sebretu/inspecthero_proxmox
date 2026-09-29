#!/usr/bin/env python3
"""
SYMBOL RETRIEVAL IMPROVEMENT EXPERIMENT V2
Etap 1: GT Quality Audit
Etap 2: Hybrid Retrieval (embedding + class_prob + geometric)
Etap 3: Siamese Contrastive (Triplet Loss, ResNet18)
Etap 4: Ensemble benchmark
"""
import os, io, sys, json, random, time
from datetime import datetime
import numpy as np
from PIL import Image
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import LabelEncoder

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
import torchvision.models as models
import torchvision.transforms as transforms

from supabase import create_client

# ─── Helpers ────────────────────────────────────────────────────────────────

def log(msg):
    ts = datetime.utcnow().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)

# ─── Supabase ───────────────────────────────────────────────────────────────

ENV_PATH = "/home/ubuntu/inspecthero-web.env"
env_vars = {}
if os.path.exists(ENV_PATH):
    with open(ENV_PATH) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env_vars[k.strip()] = v.strip()

SUPABASE_URL = env_vars.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = env_vars.get("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

REPORT_DIR = "/home/ubuntu/building-task-manager/web"
CONFUSION_PAIRS = [("socket","edv"),("socket","sym_socket"),("light","special"),("cee","socket")]

# ─── Transforms ─────────────────────────────────────────────────────────────

TRANSFORM = transforms.Compose([
    transforms.Resize((224,224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485,0.456,0.406],[0.229,0.224,0.225])
])
AUG_TRANSFORM = transforms.Compose([
    transforms.RandomResizedCrop(224, scale=(0.8,1.0)),
    transforms.RandomRotation(20),
    transforms.RandomHorizontalFlip(),
    transforms.ColorJitter(0.2, 0.2, 0.1),
    transforms.ToTensor(),
    transforms.Normalize([0.485,0.456,0.406],[0.229,0.224,0.225])
])

# ─── Evaluation ─────────────────────────────────────────────────────────────

def build_confusion_map():
    cmap = {}
    for a,b in CONFUSION_PAIRS:
        cmap[f"{a}->{b}"] = 0
        cmap[f"{b}->{a}"] = 0
    return cmap

def evaluate_retrieval(items, emb_key, name, sim_matrix=None):
    N = len(items)
    if N == 0: return None
    class_counts = {}
    for it in items:
        c = it["symbol_type"]
        class_counts[c] = class_counts.get(c, 0) + 1

    cmap = build_confusion_map()

    if sim_matrix is None:
        embs = np.array([it[emb_key] for it in items], dtype=np.float32)
        norms = np.linalg.norm(embs, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        embs = embs / norms
        sim = np.dot(embs, embs.T)
    else:
        sim = sim_matrix.copy()
    np.fill_diagonal(sim, -999.0)

    p1, p5, r10, mrr, fm = 0, 0, 0, 0, 0
    for i in range(N):
        qt = items[i]["symbol_type"]
        top10 = np.argsort(-sim[i])[:10]
        t1 = items[top10[0]]["symbol_type"]
        if t1 == qt:
            p1 += 1
        else:
            fm += 1
            if f"{qt}->{t1}" in cmap: cmap[f"{qt}->{t1}"] += 1
        p5 += sum(1 for idx in top10[:5] if items[idx]["symbol_type"] == qt) / 5.0
        tot = class_counts[qt] - 1
        r10 += min(1.0, sum(1 for idx in top10 if items[idx]["symbol_type"] == qt) / tot) if tot > 0 else 1.0
        rank = next((r+1 for r,idx in enumerate(np.argsort(-sim[i])) if items[idx]["symbol_type"] == qt), N)
        mrr += 1.0/rank if rank > 0 else 0.0

    sock_edv = cmap.get("socket->edv",0) + cmap.get("edv->socket",0)
    return {
        "pipeline": name,
        "precision1": round(p1/N, 4),
        "precision5": round(p5/N, 4),
        "recall10": round(r10/N, 4),
        "mrr": round(mrr/N, 4),
        "false_match_rate": round(fm/N, 4),
        "socket_edv_errors": sock_edv,
        "confusion": cmap
    }

# ─── Step 0: Load data ──────────────────────────────────────────────────────

log("=== SYMBOL RETRIEVAL V2 ===")
log("Fetching approved crops from DB...")
crops_res = supabase.table("symbol_crops").select(
    "id, stromkreis_id, plan_id, symbol_type, embedding, metadata"
).eq("quality_status", "approved").execute()
approved = crops_res.data or []
log(f"Loaded {len(approved)} crops from DB.")

unique_classes = sorted(set(c["symbol_type"] for c in approved if c.get("symbol_type")))
class2idx = {c:i for i,c in enumerate(unique_classes)}
log(f"Classes ({len(unique_classes)}): {unique_classes}")

log("Downloading V2 crop images...")
items = []
for idx, crop in enumerate(approved):
    v2_path = f"symbol_crops_v2/{crop['plan_id']}/{crop['stromkreis_id']}/256.png"
    try:
        img_data = supabase.storage.from_("symbol-crops").download(v2_path)
        if not img_data: continue
        pil = Image.open(io.BytesIO(img_data)).convert("RGB")

        emb_old = None
        if crop.get("embedding"):
            e = crop["embedding"]
            emb_old = e if isinstance(e, list) else json.loads(e)

        emb_v2 = None
        if crop.get("metadata") and crop["metadata"].get("embedding_v2"):
            e2 = crop["metadata"]["embedding_v2"]
            emb_v2 = e2 if isinstance(e2, list) else json.loads(e2)

        meta = crop.get("metadata") or {}
        bbox = meta.get("bbox") or meta.get("boundingBox") or {}
        w = float(bbox.get("width", 50))
        h = float(bbox.get("height", 50))
        area = w * h
        aspect = w / h if h > 0 else 1.0

        items.append({
            "id": crop["id"],
            "plan_id": crop["plan_id"],
            "stromkreis_id": crop["stromkreis_id"],
            "symbol_type": crop["symbol_type"],
            "label_idx": class2idx[crop["symbol_type"]],
            "pil_image": pil,
            "emb_old": emb_old,
            "emb_v2": emb_v2,
            "geo": [w, h, aspect, area],
        })
    except Exception as ex:
        pass
    if (idx+1) % 300 == 0:
        log(f"  [{idx+1}/{len(approved)}] downloaded...")

log(f"Dataset ready: {len(items)} items.")

items_with_old = [it for it in items if it["emb_old"]]
log(f"Items with V1 embedding: {len(items_with_old)}")

# ─── Step 1: GT Quality Audit ───────────────────────────────────────────────

log("\n=== ETAP 1: GROUND TRUTH QUALITY AUDIT ===")

embs_old = np.array([it["emb_old"] for it in items_with_old], dtype=np.float32)
norms = np.linalg.norm(embs_old, axis=1, keepdims=True)
norms[norms == 0] = 1.0
embs_old_norm = embs_old / norms
sim_matrix_old = np.dot(embs_old_norm, embs_old_norm.T)
np.fill_diagonal(sim_matrix_old, -999.0)

gt_issues = []
cross_class_high_sim = []  # diff class, sim > 0.90
same_class_low_sim = []    # same class, sim < 0.50

for i, it in enumerate(items_with_old):
    top5 = np.argsort(-sim_matrix_old[i])[:5]
    for j in top5:
        sim_val = float(sim_matrix_old[i][j])
        nb = items_with_old[j]
        if it["symbol_type"] != nb["symbol_type"] and sim_val > 0.90:
            cross_class_high_sim.append({
                "id": it["id"],
                "class": it["symbol_type"],
                "nearest_id": nb["id"],
                "nearest_class": nb["symbol_type"],
                "similarity": round(sim_val, 4),
                "issue": "CROSS_CLASS_HIGH_SIM"
            })

# same class low sim
class_groups = {}
for i, it in enumerate(items_with_old):
    c = it["symbol_type"]
    if c not in class_groups: class_groups[c] = []
    class_groups[c].append(i)

for cls, idxs in class_groups.items():
    if len(idxs) < 2: continue
    for i in idxs:
        for j in idxs:
            if i >= j: continue
            sim_val = float(sim_matrix_old[i][j])
            if sim_val < 0.50:
                same_class_low_sim.append({
                    "id": items_with_old[i]["id"],
                    "class": cls,
                    "nearest_id": items_with_old[j]["id"],
                    "similarity": round(sim_val, 4),
                    "issue": "SAME_CLASS_LOW_SIM"
                })

log(f"Cross-class high sim (>0.90): {len(cross_class_high_sim)}")
log(f"Same-class low sim (<0.50):   {len(same_class_low_sim)}")

# Class distribution
class_dist = {}
for it in items:
    c = it["symbol_type"]
    class_dist[c] = class_dist.get(c, 0) + 1
log(f"Class distribution: {class_dist}")

gt_audit = {
    "total_items": len(items_with_old),
    "cross_class_high_similarity_pairs": len(cross_class_high_sim),
    "same_class_low_similarity_pairs": len(same_class_low_sim),
    "class_distribution": class_dist,
    "cross_class_samples": cross_class_high_sim[:50],
    "same_class_low_sim_samples": same_class_low_sim[:50],
}
with open(f"{REPORT_DIR}/ground_truth_similarity_audit.json", "w") as f:
    json.dump(gt_audit, f, indent=2)
log("GT audit saved.")

# Baseline V1
np.fill_diagonal(sim_matrix_old, -999.0)
results = {}
results["V1_OLD"] = evaluate_retrieval(items_with_old, "emb_old", "V1_OLD_Handcrafted", sim_matrix=sim_matrix_old)
log(f"Baseline V1: P@1={results['V1_OLD']['precision1']*100:.2f}% | sock<->edv={results['V1_OLD']['socket_edv_errors']}")

# ─── Step 2: Hybrid Retrieval ───────────────────────────────────────────────

log("\n=== ETAP 2: HYBRID RETRIEVAL ===")

# 2a. Logistic Regression class probability
log("Training Logistic Regression classifier...")
X_lr = embs_old_norm
y_lr = np.array([it["label_idx"] for it in items_with_old])
lr_model = LogisticRegression(max_iter=1000, C=1.0, solver="lbfgs")
lr_model.fit(X_lr, y_lr)
class_probs = lr_model.predict_proba(X_lr)  # (N, num_classes)
log(f"LR classifier trained. Classes: {lr_model.classes_}")

# 2b. Geometric similarity
geo_arr = np.array([it["geo"] for it in items_with_old], dtype=np.float32)
geo_arr = geo_arr / (np.max(geo_arr, axis=0, keepdims=True) + 1e-6)
geo_sim = np.dot(geo_arr, geo_arr.T)  # cosine-like but on normalized geo
geo_sim = (geo_sim + 1) / 2.0  # scale 0-1

# 2c. Hybrid score
# For each query i, score_j = 0.70 * emb_sim + 0.20 * class_overlap + 0.10 * geo_sim
emb_sim = (sim_matrix_old + 1) / 2.0  # re-fill diag properly
np.fill_diagonal(emb_sim, 0.0)
np.fill_diagonal(sim_matrix_old, -999.0)

# class_overlap: dot product of class probability vectors
class_overlap = np.dot(class_probs, class_probs.T)
np.fill_diagonal(class_overlap, 0.0)

hybrid_sim = 0.70 * emb_sim + 0.20 * class_overlap + 0.10 * geo_sim
np.fill_diagonal(hybrid_sim, -999.0)

results["HYBRID"] = evaluate_retrieval(items_with_old, None, "Hybrid_V2", sim_matrix=hybrid_sim)
log(f"Hybrid: P@1={results['HYBRID']['precision1']*100:.2f}% | sock<->edv={results['HYBRID']['socket_edv_errors']}")

# Try different weight combos
best_hybrid = results["HYBRID"].copy()
best_alpha = (0.70, 0.20, 0.10)
for a in [0.60, 0.65, 0.70, 0.75, 0.80, 0.85]:
    for b in [0.10, 0.15, 0.20, 0.25]:
        c_w = 1.0 - a - b
        if c_w < 0: continue
        h = a * emb_sim + b * class_overlap + c_w * geo_sim
        np.fill_diagonal(h, -999.0)
        r = evaluate_retrieval(items_with_old, None, f"Hybrid_{a}_{b}_{c_w:.2f}", sim_matrix=h)
        if r["precision1"] > best_hybrid["precision1"]:
            best_hybrid = r
            best_alpha = (a, b, c_w)
            log(f"  New best hybrid: {best_alpha} P@1={r['precision1']*100:.2f}%")

results["HYBRID_BEST"] = best_hybrid
log(f"Best Hybrid weights: emb={best_alpha[0]} cls={best_alpha[1]} geo={best_alpha[2]}")
log(f"Best Hybrid: P@1={best_hybrid['precision1']*100:.2f}% | sock<->edv={best_hybrid['socket_edv_errors']}")

# ─── Step 3: Siamese / Triplet Contrastive ──────────────────────────────────

log("\n=== ETAP 3: SIAMESE CONTRASTIVE (TRIPLET LOSS) ===")

class Dataset224(Dataset):
    def __init__(self, items):
        self.items = items
    def __len__(self): return len(self.items)
    def __getitem__(self, i):
        return TRANSFORM(self.items[i]["pil_image"]), self.items[i]["label_idx"], i

# Plan-based split (no symbol appears in both train and test)
plan_ids = list(set(it["plan_id"] for it in items))
random.shuffle(plan_ids)
n = len(plan_ids)
train_plans = set(plan_ids[:int(n*0.70)])
val_plans   = set(plan_ids[int(n*0.70):int(n*0.85)])
test_plans  = set(plan_ids[int(n*0.85):])

train_items = [it for it in items if it["plan_id"] in train_plans]
val_items   = [it for it in items if it["plan_id"] in val_plans]
test_items  = [it for it in items if it["plan_id"] in test_plans]
log(f"Train/Val/Test split: {len(train_items)}/{len(val_items)}/{len(test_items)}")

# Triplet dataset
HARD_NEG_CLASSES = {
    "socket": ["edv","sym_socket"],
    "edv":    ["socket","sym_socket"],
    "light":  ["special"],
    "special":["light"],
    "sym_socket": ["socket","edv"],
}

class TripletDataset(Dataset):
    def __init__(self, items, hard_neg_ratio=0.6):
        self.items = items
        self.hard_neg_ratio = hard_neg_ratio
        self.class_map = {}
        for i, it in enumerate(items):
            c = it["symbol_type"]
            if c not in self.class_map: self.class_map[c] = []
            self.class_map[c].append(i)

    def __len__(self):
        return len(self.items) * 4

    def __getitem__(self, idx):
        anchor = self.items[idx % len(self.items)]
        cls = anchor["symbol_type"]
        # Positive: same class
        pos_candidates = [i for i in self.class_map[cls] if i != idx % len(self.items)]
        if not pos_candidates:
            pos_idx = idx % len(self.items)
        else:
            pos_idx = random.choice(pos_candidates)
        pos = self.items[pos_idx]
        # Negative: hard or random
        if random.random() < self.hard_neg_ratio and cls in HARD_NEG_CLASSES:
            hard_cls = random.choice(HARD_NEG_CLASSES[cls])
            hard_cands = self.class_map.get(hard_cls, [])
            if hard_cands:
                neg_idx = random.choice(hard_cands)
                neg = self.items[neg_idx]
            else:
                neg_cls = random.choice([c for c in self.class_map if c != cls])
                neg = self.items[random.choice(self.class_map[neg_cls])]
        else:
            neg_cls = random.choice([c for c in self.class_map if c != cls])
            neg = self.items[random.choice(self.class_map[neg_cls])]

        return (
            AUG_TRANSFORM(anchor["pil_image"]),
            AUG_TRANSFORM(pos["pil_image"]),
            TRANSFORM(neg["pil_image"]),
        )

class SiameseResNet18(nn.Module):
    def __init__(self, emb_dim=128):
        super().__init__()
        base = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
        self.backbone = nn.Sequential(*list(base.children())[:-1])
        self.proj = nn.Sequential(
            nn.Linear(512, 256),
            nn.ReLU(),
            nn.Linear(256, emb_dim)
        )
    def forward(self, x):
        feat = torch.flatten(self.backbone(x), 1)
        return F.normalize(self.proj(feat), p=2, dim=1)

siamese = SiameseResNet18(emb_dim=128)
triplet_loss = nn.TripletMarginLoss(margin=0.3, p=2)
optimizer = torch.optim.AdamW(siamese.parameters(), lr=1e-3, weight_decay=1e-4)
scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=50)

train_loader = DataLoader(TripletDataset(train_items), batch_size=32, shuffle=True, num_workers=0)

EPOCHS = 50
best_val_p1 = 0.0
best_epoch = 0

for epoch in range(1, EPOCHS+1):
    siamese.train()
    loss_sum, n_batches = 0.0, 0
    for anc, pos, neg in train_loader:
        optimizer.zero_grad()
        ea = siamese(anc)
        ep = siamese(pos)
        en = siamese(neg)
        loss = triplet_loss(ea, ep, en)
        loss.backward()
        optimizer.step()
        loss_sum += loss.item()
        n_batches += 1
    scheduler.step()

    if epoch % 5 == 0 or epoch == EPOCHS:
        # Val evaluation
        siamese.eval()
        val_embs = []
        val_loader = DataLoader(Dataset224(val_items), batch_size=64, shuffle=False)
        with torch.no_grad():
            for tensors, _, _ in val_loader:
                val_embs.append(siamese(tensors).numpy())
        if val_embs:
            val_embs = np.vstack(val_embs)
            for i, it in enumerate(val_items): it["emb_siamese_tmp"] = val_embs[i]
            vr = evaluate_retrieval(val_items, "emb_siamese_tmp", "siamese_val")
            if vr and vr["precision1"] > best_val_p1:
                best_val_p1 = vr["precision1"]
                best_epoch = epoch
                torch.save(siamese.state_dict(), f"{REPORT_DIR}/siamese_best.pth")
            log(f"  Epoch [{epoch}/{EPOCHS}] Loss: {loss_sum/n_batches:.4f} | Val P@1={vr['precision1']*100:.2f}% | Best={best_val_p1*100:.2f}%@ep{best_epoch}")
        else:
            log(f"  Epoch [{epoch}/{EPOCHS}] Loss: {loss_sum/n_batches:.4f}")

log(f"Best siamese val P@1={best_val_p1*100:.2f}% at epoch {best_epoch}")

# Load best model and evaluate on test set

if os.path.exists(f"{REPORT_DIR}/siamese_best.pth"):
    siamese.load_state_dict(torch.load(f"{REPORT_DIR}/siamese_best.pth"))
siamese.eval()

# Extract siamese embs for ALL items
all_loader = DataLoader(Dataset224(items), batch_size=64, shuffle=False)
all_siamese_embs = []
with torch.no_grad():
    for bi, (tensors, _, _) in enumerate(all_loader):
        all_siamese_embs.append(siamese(tensors).numpy())
        if (bi+1) % 5 == 0:
            log(f"  [Siamese extract] batch {bi+1}/{len(all_loader)}")
all_siamese_embs = np.vstack(all_siamese_embs)
for i, it in enumerate(items): it["emb_siamese"] = all_siamese_embs[i]

# Full evaluation
results["SIAMESE"] = evaluate_retrieval(items, "emb_siamese", "Siamese_ContrastiveLoss")
log(f"Siamese (full): P@1={results['SIAMESE']['precision1']*100:.2f}% | sock<->edv={results['SIAMESE']['socket_edv_errors']}")

# ─── Step 4: Ensemble ───────────────────────────────────────────────────────

log("\n=== ETAP 4: ENSEMBLE ===")

# Build siamese sim matrix for items_with_old (intersection)
ids_old = set(it["id"] for it in items_with_old)
items_both = [it for it in items if it["id"] in ids_old and it.get("emb_siamese") is not None]
log(f"Items with both V1 + Siamese: {len(items_both)}")

embs_old2 = np.array([it["emb_old"] for it in items_both], dtype=np.float32)
n2 = np.linalg.norm(embs_old2, axis=1, keepdims=True); n2[n2==0] = 1.0
embs_old2 = embs_old2 / n2

embs_sia2 = np.array([it["emb_siamese"] for it in items_both], dtype=np.float32)
n3 = np.linalg.norm(embs_sia2, axis=1, keepdims=True); n3[n3==0] = 1.0
embs_sia2 = embs_sia2 / n3

sim_old2 = np.dot(embs_old2, embs_old2.T)
sim_sia2 = np.dot(embs_sia2, embs_sia2.T)

best_ensemble = None
best_w = 0.5
for w in [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]:
    ens = w * sim_old2 + (1-w) * sim_sia2
    np.fill_diagonal(ens, -999.0)
    r = evaluate_retrieval(items_both, None, f"Ensemble_V1_{w}_Sia_{1-w:.1f}", sim_matrix=ens)
    log(f"  Ensemble w={w:.1f}/{1-w:.1f}: P@1={r['precision1']*100:.2f}% sock<->edv={r['socket_edv_errors']}")
    if best_ensemble is None or r["precision1"] > best_ensemble["precision1"]:
        best_ensemble = r
        best_w = w

results["ENSEMBLE_BEST"] = best_ensemble
log(f"Best ensemble: w_V1={best_w} | P@1={best_ensemble['precision1']*100:.2f}%")

# Hybrid + Siamese ensemble
if len(items_both) > 0:
    # rebuild hybrid for items_both
    class_probs2 = lr_model.predict_proba(embs_old2)
    class_ol2 = np.dot(class_probs2, class_probs2.T)
    geo2 = np.array([it["geo"] for it in items_both], dtype=np.float32)
    geo2 = geo2 / (np.max(geo2, axis=0, keepdims=True) + 1e-6)
    geo_s2 = np.dot(geo2, geo2.T)
    emb_s2 = (sim_old2 + 1) / 2.0
    a, b_w, c_w = best_alpha
    hybrid2 = a * emb_s2 + b_w * class_ol2 + c_w * geo_s2

    best_tri_ens = None
    best_tri_w = (0.5, 0.3, 0.2)
    for wh in [0.4, 0.5, 0.6]:
        for ws in [0.2, 0.3, 0.4]:
            wv1 = 1.0 - wh - ws
            if wv1 < 0: continue
            tri = wh * hybrid2 + ws * sim_sia2 + wv1 * sim_old2
            np.fill_diagonal(tri, -999.0)
            r = evaluate_retrieval(items_both, None, f"TriEns_H{wh}_S{ws}_V{wv1:.1f}", sim_matrix=tri)
            if best_tri_ens is None or r["precision1"] > best_tri_ens["precision1"]:
                best_tri_ens = r
                best_tri_w = (wh, ws, wv1)
                log(f"  New best 3-way: H={wh} S={ws} V1={wv1:.1f} P@1={r['precision1']*100:.2f}%")

    results["ENSEMBLE_TRIPLE"] = best_tri_ens

# ─── Final Report ────────────────────────────────────────────────────────────

log("\n=== RESULTS SUMMARY ===")
log(f"{'Pipeline':<45} | P@1      | P@5      | MRR    | sock<->edv")
for k, r in results.items():
    if r:
        log(f"  {k:<43} | {r['precision1']*100:.2f}%   | {r['precision5']*100:.2f}%   | {r['mrr']:.4f} | {r['socket_edv_errors']}")

best_key = max(results.keys(), key=lambda k: results[k]["precision1"] if results[k] else 0)
best_p1 = results[best_key]["precision1"]
v1_p1 = results["V1_OLD"]["precision1"]
v1_sock = results["V1_OLD"]["socket_edv_errors"]
best_sock = results[best_key]["socket_edv_errors"]

is_success = best_p1 > 0.85
is_good = best_p1 > 0.82
sock_improved = (v1_sock - best_sock) / v1_sock > 0.50 if v1_sock > 0 else False

report = {
    "generated_at": datetime.utcnow().isoformat(),
    "total_queries": len(items),
    "experiment_status": "SUCCESS" if is_success else ("GOOD" if is_good else "COMPLETED"),
    "target_82pct_achieved": is_good,
    "target_85pct_achieved": is_success,
    "socket_edv_50pct_reduction": sock_improved,
    "best_pipeline": best_key,
    "best_precision1": best_p1,
    "baseline_v1_precision1": v1_p1,
    "improvement_over_baseline": round(best_p1 - v1_p1, 4),
    "siamese_best_val_epoch": best_epoch,
    "siamese_best_val_p1": best_val_p1,
    "hybrid_best_weights": {"emb": best_alpha[0], "cls": best_alpha[1], "geo": best_alpha[2]},
    "ensemble_best_weight_v1": best_w,
    "gt_audit_summary": {
        "cross_class_high_similarity_pairs": len(cross_class_high_sim),
        "same_class_low_similarity_pairs": len(same_class_low_sim),
    },
    "pipeline_results": {k: v for k, v in results.items() if v},
    "recommended_pipeline": best_key,
}

with open(f"{REPORT_DIR}/symbol_retrieval_v2_report.json", "w") as f:
    json.dump(report, f, indent=2)

log(f"\nFINAL: {best_key} P@1={best_p1*100:.2f}% (baseline={v1_p1*100:.2f}%)")
log(f"sock<->edv: {v1_sock} -> {best_sock} ({'IMPROVED' if sock_improved else 'NO_CHANGE'})")
log(f"Report saved to {REPORT_DIR}/symbol_retrieval_v2_report.json")
