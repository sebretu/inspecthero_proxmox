#!/usr/bin/env python3
"""
DEEP_SYMBOL_EMBEDDING_EXPERIMENT_V1 — Optimized version with progress flushing
Runs MobileNetV3 + ResNet18 zero-shot, then fine-tunes ResNet18.
Skips CLIP/DINOv2 to keep CPU runtime reasonable.
"""

import os, io, sys, json, random
from datetime import datetime
import numpy as np
from PIL import Image

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
import torchvision.models as models
import torchvision.transforms as transforms

from supabase import create_client

def log(msg):
    print(msg)
    sys.stdout.flush()

ENV_PATH = "/home/ubuntu/inspecthero-web.env"
env_vars = {}
if os.path.exists(ENV_PATH):
    with open(ENV_PATH, "r") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env_vars[k.strip()] = v.strip()

SUPABASE_URL = env_vars.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = env_vars.get("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
REPORT_PATH = "/home/ubuntu/building-task-manager/web/deep_embedding_experiment_report.json"

torch.manual_seed(42)
np.random.seed(42)
random.seed(42)

TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

def evaluate_retrieval(items, emb_key, name):
    N = len(items)
    if N == 0: return None
    class_counts = {}
    for it in items:
        c = it['symbol_type']
        class_counts[c] = class_counts.get(c, 0) + 1

    confusion_pairs = [("socket","edv"),("socket","sym_socket"),("light","special"),("cee","socket")]
    cmap = {}
    for a,b in confusion_pairs:
        cmap[f"{a}->{b}"] = 0
        cmap[f"{b}->{a}"] = 0

    embs = np.array([it[emb_key] for it in items], dtype=np.float32)
    norms = np.linalg.norm(embs, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    embs = embs / norms
    sim = np.dot(embs, embs.T)
    np.fill_diagonal(sim, -999.0)

    p1, p5, r10, mrr, fm = 0, 0, 0, 0, 0
    for i in range(N):
        qt = items[i]['symbol_type']
        top10 = np.argsort(-sim[i])[:10]
        t1 = items[top10[0]]['symbol_type']
        if t1 == qt:
            p1 += 1
        else:
            fm += 1
            if f"{qt}->{t1}" in cmap: cmap[f"{qt}->{t1}"] += 1
        p5 += sum(1 for idx in top10[:5] if items[idx]['symbol_type'] == qt) / 5.0
        tot = class_counts[qt] - 1
        r10 += min(1.0, sum(1 for idx in top10 if items[idx]['symbol_type'] == qt) / tot) if tot > 0 else 1.0
        rank = next((r+1 for r,idx in enumerate(np.argsort(-sim[i])) if items[idx]['symbol_type'] == qt), 0)
        mrr += 1.0/rank if rank > 0 else 0.0

    return {
        "pipeline": name,
        "precision1": round(p1/N, 4),
        "precision5": round(p5/N, 4),
        "recall10": round(r10/N, 4),
        "mrr": round(mrr/N, 4),
        "false_match_rate": round(fm/N, 4),
        "socket_edv_error": cmap["socket->edv"] + cmap["edv->socket"],
        "confusion": cmap
    }

class Dataset224(Dataset):
    def __init__(self, items):
        self.items = items
    def __len__(self):
        return len(self.items)
    def __getitem__(self, i):
        return TRANSFORM(self.items[i]['pil_image']), self.items[i]['label_idx'], i

def extract_embs(model, items, batch_size=64, name=""):
    model.eval()
    loader = DataLoader(Dataset224(items), batch_size=batch_size, shuffle=False)
    all_embs = []
    with torch.no_grad():
        for bi, (tensors, _, _) in enumerate(loader):
            feats = model(tensors)
            all_embs.append(feats.numpy())
            log(f"  [{name}] batch {bi+1}/{len(loader)} done")
    return np.vstack(all_embs)

# Feature extractors
class MobileNetV3Ext(nn.Module):
    def __init__(self):
        super().__init__()
        base = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.DEFAULT)
        self.features = base.features
        self.avgpool = base.avgpool
    def forward(self, x):
        x = self.features(x)
        x = self.avgpool(x)
        return F.normalize(torch.flatten(x, 1), p=2, dim=1)

class ResNet18Ext(nn.Module):
    def __init__(self):
        super().__init__()
        base = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
        layers = list(base.children())[:-1]
        self.backbone = nn.Sequential(*layers)
    def forward(self, x):
        return F.normalize(torch.flatten(self.backbone(x), 1), p=2, dim=1)

class FineTunedResNet18(nn.Module):
    def __init__(self, num_classes):
        super().__init__()
        base = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
        self.backbone = nn.Sequential(*list(base.children())[:-1])
        self.emb_proj = nn.Linear(512, 512)
        self.classifier = nn.Linear(512, num_classes)
    def embed(self, x):
        feat = torch.flatten(self.backbone(x), 1)
        return F.normalize(self.emb_proj(feat), p=2, dim=1)
    def forward(self, x):
        return self.classifier(self.embed(x)), self.embed(x)

# ===========================
log("=== DEEP SYMBOL EMBEDDING EXPERIMENT V1 ===")
log("Fetching approved symbol_crops from DB...")

crops_res = supabase.table("symbol_crops").select("id, stromkreis_id, plan_id, symbol_type, embedding, metadata").eq("quality_status", "approved").execute()
approved = crops_res.data or []
log(f"Loaded {len(approved)} crops.")

unique_classes = sorted(set(c['symbol_type'] for c in approved if c.get('symbol_type')))
class2idx = {c: i for i, c in enumerate(unique_classes)}
log(f"Classes: {unique_classes}")

log("\nDownloading V2 crops from Storage...")
items = []
for idx, crop in enumerate(approved):
    v2_path = f"symbol_crops_v2/{crop['plan_id']}/{crop['stromkreis_id']}/256.png"
    try:
        img_data = supabase.storage.from_("symbol-crops").download(v2_path)
        if not img_data:
            continue
        pil_img = Image.open(io.BytesIO(img_data)).convert("RGB")
        old_emb = None
        if crop.get('embedding'):
            e = crop['embedding']
            old_emb = e if isinstance(e, list) else json.loads(e)
        v2_emb = None
        if crop.get('metadata') and crop['metadata'].get('embedding_v2'):
            e2 = crop['metadata']['embedding_v2']
            v2_emb = e2 if isinstance(e2, list) else json.loads(e2)

        items.append({
            "id": crop['id'],
            "plan_id": crop['plan_id'],
            "stromkreis_id": crop['stromkreis_id'],
            "symbol_type": crop['symbol_type'],
            "label_idx": class2idx[crop['symbol_type']],
            "pil_image": pil_img,
            "emb_old": old_emb,
            "emb_v2": v2_emb
        })
    except Exception:
        pass
    if (idx + 1) % 300 == 0:
        log(f"  [{idx+1}/{len(approved)}] images downloaded so far...")

log(f"Loaded {len(items)} images total.")

# Baselines
results = {}
results["V1_OLD"] = evaluate_retrieval([it for it in items if it['emb_old']], "emb_old", "V1_OLD_Handcrafted")
results["V2_1"] = evaluate_retrieval([it for it in items if it['emb_v2']], "emb_v2", "V2.1_Handcrafted")
log(f"Baseline V1: P@1={results['V1_OLD']['precision1']*100:.2f}%")
log(f"Baseline V2: P@1={results['V2_1']['precision1']*100:.2f}%")

# Zero-shot MobileNetV3
log("\nExtracting MobileNetV3 zero-shot embeddings...")
mob_embs = extract_embs(MobileNetV3Ext(), items, batch_size=64, name="MobileNetV3")
for i, it in enumerate(items): it['emb_mob'] = mob_embs[i]
results["MODEL_A_MobileNetV3"] = evaluate_retrieval(items, "emb_mob", "MobileNetV3")
log(f"MobileNetV3: P@1={results['MODEL_A_MobileNetV3']['precision1']*100:.2f}% | sock<->edv={results['MODEL_A_MobileNetV3']['socket_edv_error']}")

# Zero-shot ResNet18
log("\nExtracting ResNet18 zero-shot embeddings...")
r18_embs = extract_embs(ResNet18Ext(), items, batch_size=64, name="ResNet18")
for i, it in enumerate(items): it['emb_r18'] = r18_embs[i]
results["MODEL_B_ResNet18"] = evaluate_retrieval(items, "emb_r18", "ResNet18")
log(f"ResNet18: P@1={results['MODEL_B_ResNet18']['precision1']*100:.2f}% | sock<->edv={results['MODEL_B_ResNet18']['socket_edv_error']}")

# FAZA 2: Fine-Tune
log("\n=== FAZA 2: METRIC FINE-TUNING ===")
plan_ids = list(set(it['plan_id'] for it in items))
random.shuffle(plan_ids)
split = int(len(plan_ids) * 0.8)
train_plans = set(plan_ids[:split])
train_items = [it for it in items if it['plan_id'] in train_plans]
val_items = [it for it in items if it['plan_id'] not in train_plans]
log(f"Train: {len(train_items)} | Val: {len(val_items)}")

AUG_TRANSFORM = transforms.Compose([
    transforms.RandomResizedCrop(224, scale=(0.85, 1.0)),
    transforms.RandomRotation(15),
    transforms.ColorJitter(brightness=0.2, contrast=0.2),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

class AugDataset(Dataset):
    def __init__(self, items):
        self.items = items
    def __len__(self):
        return len(self.items)
    def __getitem__(self, i):
        return AUG_TRANSFORM(self.items[i]['pil_image']), self.items[i]['label_idx'], i

ft_model = FineTunedResNet18(num_classes=len(unique_classes))
optimizer = torch.optim.AdamW(ft_model.parameters(), lr=1e-3, weight_decay=1e-4)
scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=15)
criterion = nn.CrossEntropyLoss()
train_loader = DataLoader(AugDataset(train_items), batch_size=32, shuffle=True)

EPOCHS = 15
for epoch in range(1, EPOCHS + 1):
    ft_model.train()
    loss_sum, correct, total = 0.0, 0, 0
    for tensors, labels, _ in train_loader:
        optimizer.zero_grad()
        logits, _ = ft_model(tensors)
        loss = criterion(logits, labels)
        loss.backward()
        optimizer.step()
        loss_sum += loss.item() * tensors.size(0)
        correct += (torch.argmax(logits, 1) == labels).sum().item()
        total += tensors.size(0)
    scheduler.step()
    acc = correct / total
    log(f"  Epoch [{epoch}/{EPOCHS}] Loss: {loss_sum/total:.4f} | Acc: {acc*100:.2f}%")

# Extract fine-tuned embeddings
log("\nExtracting fine-tuned embeddings...")
loader_all = DataLoader(Dataset224(items), batch_size=64, shuffle=False)
ft_model.eval()
ft_embs = []
with torch.no_grad():
    for bi, (tensors, _, _) in enumerate(loader_all):
        ft_embs.append(ft_model.embed(tensors).numpy())
        log(f"  [FineTuned] batch {bi+1}/{len(loader_all)} done")
ft_embs = np.vstack(ft_embs)
for i, it in enumerate(items): it['emb_ft'] = ft_embs[i]
results["MODEL_FINE_TUNED_ResNet18"] = evaluate_retrieval(items, "emb_ft", "FineTuned_ResNet18")
log(f"FineTuned: P@1={results['MODEL_FINE_TUNED_ResNet18']['precision1']*100:.2f}% | sock<->edv={results['MODEL_FINE_TUNED_ResNet18']['socket_edv_error']}")

# Final summary
log("\n=== RESULTS SUMMARY ===")
log(f"{'Pipeline':<35} | P@1      | P@5      | MRR    | sock<->edv")
for k, r in results.items():
    log(f"  {k:<33} | {r['precision1']*100:.2f}%   | {r['precision5']*100:.2f}%   | {r['mrr']:.4f} | {r['socket_edv_error']}")

best_key = max(results.keys(), key=lambda k: results[k]['precision1'])
best_p1 = results[best_key]['precision1']
v1_p1 = results["V1_OLD"]['precision1']
final_decision = "DEEP" if best_p1 > v1_p1 else "OLD"
is_success = best_p1 > 0.85

report = {
    "generated_at": datetime.utcnow().isoformat(),
    "total_queries": len(items),
    "experiment_status": "SUCCESS" if is_success else "COMPLETED",
    "target_precision1_achieved": is_success,
    "best_pipeline": best_key,
    "best_precision1": best_p1,
    "final_decision": final_decision,
    "pipeline_results": results
}

with open(REPORT_PATH, "w") as f:
    json.dump(report, f, indent=2)

log(f"\nFINAL DECISION: {final_decision}")
log(f"Best: {best_key} (P@1={best_p1*100:.2f}%)")
log(f"Report saved to {REPORT_PATH}")
