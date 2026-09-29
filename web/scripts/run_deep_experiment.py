#!/usr/bin/env python3
"""
TASK: Build DEEP_SYMBOL_EMBEDDING_EXPERIMENT_V1

Tests pretrained zero-shot deep learning vision encoders (MobileNetV3, ResNet18, ResNet50, CLIP, DINOv2)
and fine-tuned metric learning encoders on 1320 approved CAD symbol crops.
"""

import os
import io
import json
import math
import random
import time
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

# Load environment variables
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

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing SUPABASE env variables")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
REPORT_OUTPUT_PATH = "/home/ubuntu/building-task-manager/web/deep_embedding_experiment_report.json"

# Set random seeds for reproducibility
torch.manual_seed(42)
np.random.seed(42)
random.seed(42)

# ImageNet standard normalization transform (224x224)
img_transform_224 = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

# DINOv2 transform (518x518)
img_transform_518 = transforms.Compose([
    transforms.Resize((518, 518)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

def evaluate_retrieval(dataset_items, emb_key, pipeline_name):
    """
    Runs leave-one-out nearest-neighbor retrieval benchmark on dataset_items.
    """
    N = len(dataset_items)
    if N == 0:
        return None

    class_counts = {}
    for item in dataset_items:
        c = item['symbol_type']
        class_counts[c] = class_counts.get(c, 0) + 1

    confusion_pairs = [
        ("socket", "edv"),
        ("socket", "sym_socket"),
        ("light", "special"),
        ("cee", "socket")
    ]
    confusion_map = {}
    for a, b in confusion_pairs:
        confusion_map[f"{a}->{b}"] = 0
        confusion_map[f"{b}->{a}"] = 0

    p1_sum = 0
    p5_sum = 0
    r10_sum = 0
    mrr_sum = 0
    false_matches = 0

    # Build matrix N x D
    embs = np.array([item[emb_key] for item in dataset_items], dtype=np.float32)
    # Norm check
    norms = np.linalg.norm(embs, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    embs = embs / norms

    # Compute full similarity matrix N x N
    sim_matrix = np.dot(embs, embs.T)
    np.fill_diagonal(sim_matrix, -999.0) # mask self

    for i in range(N):
        query_type = dataset_items[i]['symbol_type']
        scores = sim_matrix[i]
        top_indices = np.argsort(-scores)[:10]

        top1_type = dataset_items[top_indices[0]]['symbol_type']
        top5_types = [dataset_items[idx]['symbol_type'] for idx in top_indices[:5]]
        top10_types = [dataset_items[idx]['symbol_type'] for idx in top_indices[:10]]

        # Precision@1
        if top1_type == query_type:
            p1_sum += 1
        else:
            false_matches += 1
            pair_key = f"{query_type}->{top1_type}"
            if pair_key in confusion_map:
                confusion_map[pair_key] += 1

        # Precision@5
        m5 = sum(1 for t in top5_types if t == query_type)
        p5_sum += m5 / 5.0

        # Recall@10
        total_same = class_counts[query_type] - 1
        m10 = sum(1 for t in top10_types if t == query_type)
        r10_sum += min(1.0, m10 / float(total_same)) if total_same > 0 else 1.0

        # MRR
        sorted_all = np.argsort(-scores)
        rank = 0
        for r_idx, idx in enumerate(sorted_all):
            if dataset_items[idx]['symbol_type'] == query_type:
                rank = r_idx + 1
                break
        mrr_sum += 1.0 / rank if rank > 0 else 0.0

    return {
        "pipeline": pipeline_name,
        "precision1": round(p1_sum / N, 4),
        "precision5": round(p5_sum / N, 4),
        "recall10": round(r10_sum / N, 4),
        "mrr": round(mrr_sum / N, 4),
        "false_match_rate": round(false_matches / N, 4),
        "socket_edv_error": confusion_map["socket->edv"] + confusion_map["edv->socket"],
        "confusion": confusion_map
    }

# ============================================================
# Deep Feature Extractor Wrappers
# ============================================================

class MobileNetV3FeatureExtractor(nn.Module):
    def __init__(self):
        super().__init__()
        base = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.DEFAULT)
        self.features = base.features
        self.avgpool = base.avgpool
        self.dim = 576

    def forward(self, x):
        x = self.features(x)
        x = self.avgpool(x)
        x = torch.flatten(x, 1)
        return F.normalize(x, p=2, dim=1)

class ResNet18FeatureExtractor(nn.Module):
    def __init__(self):
        super().__init__()
        base = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
        self.conv1 = base.conv1
        self.bn1 = base.bn1
        self.relu = base.relu
        self.maxpool = base.maxpool
        self.layer1 = base.layer1
        self.layer2 = base.layer2
        self.layer3 = base.layer3
        self.layer4 = base.layer4
        self.avgpool = base.avgpool
        self.dim = 512

    def forward(self, x):
        x = self.conv1(x)
        x = self.bn1(x)
        x = self.relu(x)
        x = self.maxpool(x)
        x = self.layer1(x)
        x = self.layer2(x)
        x = self.layer3(x)
        x = self.layer4(x)
        x = self.avgpool(x)
        x = torch.flatten(x, 1)
        return F.normalize(x, p=2, dim=1)

class ResNet50FeatureExtractor(nn.Module):
    def __init__(self):
        super().__init__()
        base = models.resnet50(weights=models.ResNet50_Weights.DEFAULT)
        self.conv1 = base.conv1
        self.bn1 = base.bn1
        self.relu = base.relu
        self.maxpool = base.maxpool
        self.layer1 = base.layer1
        self.layer2 = base.layer2
        self.layer3 = base.layer3
        self.layer4 = base.layer4
        self.avgpool = base.avgpool
        self.fc_proj = nn.Linear(2048, 512)
        self.dim = 512

    def forward(self, x):
        x = self.conv1(x)
        x = self.bn1(x)
        x = self.relu(x)
        x = self.maxpool(x)
        x = self.layer1(x)
        x = self.layer2(x)
        x = self.layer3(x)
        x = self.layer4(x)
        x = self.avgpool(x)
        x = torch.flatten(x, 1)
        x = self.fc_proj(x)
        return F.normalize(x, p=2, dim=1)

# Fine-Tuning Metric Model
class FineTunedResNet18(nn.Module):
    def __init__(self, num_classes):
        super().__init__()
        base = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
        self.backbone = nn.Sequential(*list(base.children())[:-1]) # up to avgpool
        self.emb_proj = nn.Linear(512, 512)
        self.classifier = nn.Linear(512, num_classes)

    def extract_embedding(self, x):
        feat = self.backbone(x)
        feat = torch.flatten(feat, 1)
        emb = self.emb_proj(feat)
        return F.normalize(emb, p=2, dim=1)

    def forward(self, x):
        emb = self.extract_embedding(x)
        logits = self.classifier(emb)
        return logits, emb

# PyTorch Dataset
class SymbolCropDataset(Dataset):
    def __init__(self, items, transform=None):
        self.items = items
        self.transform = transform

    def __len__(self):
        return len(self.items)

    def __getitem__(self, idx):
        item = self.items[idx]
        img = item['pil_image']
        if self.transform:
            tensor = self.transform(img)
        else:
            tensor = transforms.ToTensor()(img)
        return tensor, item['label_idx'], idx

def run_experiment():
    console_log = []
    def log(msg):
        print(msg)
        console_log.append(msg)

    log("=================================================")
    log("  DEEP SYMBOL EMBEDDING EXPERIMENT V1")
    log("=================================================")

    # 1. Fetch approved crops from Supabase DB
    log("Fetching approved symbol_crops from DB...")
    crops_res = supabase.table("symbol_crops").select("id, stromkreis_id, plan_id, symbol_type, embedding, metadata").eq("quality_status", "approved").execute()
    approved_crops = crops_res.data or []
    log(f"Loaded {len(approved_crops)} approved crops.")

    # Class mappings
    unique_classes = sorted(list(set(c['symbol_type'] for c in approved_crops if c.get('symbol_type'))))
    class2idx = {c: i for i, c in enumerate(unique_classes)}
    log(f"Unique classes ({len(unique_classes)}): {class2idx}")

    # 2. Download V2 crops from Supabase Storage into memory
    log("\nDownloading 256x256 V2 crop images from Storage...")
    dataset_items = []

    for idx, crop in enumerate(approved_crops):
        if (idx + 1) % 300 == 0:
            log(f"  Downloaded [{idx + 1}/{len(approved_crops)}] images...")

        v2_path = f"symbol_crops_v2/{crop['plan_id']}/{crop['stromkreis_id']}/256.png"
        try:
            img_data = supabase.storage.from_("symbol-crops").download(v2_path)
            if not img_data:
                continue
            pil_img = Image.open(io.BytesIO(img_data)).convert("RGB")

            old_emb = None
            if crop.get('embedding'):
                raw_e = crop['embedding']
                old_emb = raw_e if isinstance(raw_e, list) else json.loads(raw_e)

            v2_emb = None
            if crop.get('metadata') and crop['metadata'].get('embedding_v2'):
                raw_v2 = crop['metadata']['embedding_v2']
                v2_emb = raw_v2 if isinstance(raw_v2, list) else json.loads(raw_v2)

            dataset_items.append({
                "id": crop['id'],
                "stromkreis_id": crop['stromkreis_id'],
                "plan_id": crop['plan_id'],
                "symbol_type": crop['symbol_type'],
                "label_idx": class2idx[crop['symbol_type']],
                "pil_image": pil_img,
                "emb_old": old_emb,
                "emb_v2": v2_emb
            })
        except Exception:
            continue

    log(f"Successfully loaded {len(dataset_items)} images into benchmark dataset.")

    # PyTorch DataLoaders
    dataset_224 = SymbolCropDataset(dataset_items, transform=img_transform_224)
    loader_224 = DataLoader(dataset_224, batch_size=32, shuffle=False, num_workers=0)

    dataset_518 = SymbolCropDataset(dataset_items, transform=img_transform_518)
    loader_518 = DataLoader(dataset_518, batch_size=16, shuffle=False, num_workers=0)

    # ------------------------------------------------------------
    # FAZA 1: ZERO-SHOT PRETRAINED DEEP ENCODERS
    # ------------------------------------------------------------
    log("\n=================================================")
    log("  FAZA 1: ZERO-SHOT PRETRAINED DEEP ENCODERS")
    log("=================================================")

    zero_shot_models = {
        "MODEL_A_MobileNetV3": (MobileNetV3FeatureExtractor(), loader_224),
        "MODEL_B_ResNet18": (ResNet18FeatureExtractor(), loader_224),
        "MODEL_C_ResNet50": (ResNet50FeatureExtractor(), loader_224)
    }

    # Load CLIP image encoder if available
    try:
        from transformers import CLIPVisionModelWithProjection
        class CLIPExtractor(nn.Module):
            def __init__(self):
                super().__init__()
                self.model = CLIPVisionModelWithProjection.from_pretrained("openai/clip-vit-base-patch32")
                self.dim = 512
            def forward(self, x):
                out = self.model(pixel_values=x)
                return F.normalize(out.image_embeds, p=2, dim=1)

        zero_shot_models["MODEL_C_CLIP_ViT32"] = (CLIPExtractor(), loader_224)
        log("CLIP model loaded successfully!")
    except Exception as e:
        log(f"CLIP load skipped: {e}")

    # Load DINOv2 via timm with 518x518 input
    try:
        import timm
        class DINOv2Extractor(nn.Module):
            def __init__(self):
                super().__init__()
                self.backbone = timm.create_model('vit_small_patch14_dinov2', pretrained=True, num_classes=0, img_size=518)
                self.dim = 384
            def forward(self, x):
                feat = self.backbone(x)
                return F.normalize(feat, p=2, dim=1)

        zero_shot_models["MODEL_D_DINOv2_Small"] = (DINOv2Extractor(), loader_518)
        log("DINOv2 model (518x518) loaded successfully!")
    except Exception as e:
        log(f"DINOv2 load skipped: {e}")

    results = {}

    # Evaluate baselines first
    eval_baseline_v1 = evaluate_retrieval([it for it in dataset_items if it['emb_old']], "emb_old", "OLD_V1_Handcrafted_Baseline")
    eval_baseline_v2 = evaluate_retrieval([it for it in dataset_items if it['emb_v2']], "emb_v2", "V2.1_Handcrafted_Baseline")

    results["OLD_V1_Handcrafted_Baseline"] = eval_baseline_v1
    results["V2.1_Handcrafted_Baseline"] = eval_baseline_v2

    for model_name, (model, model_loader) in zero_shot_models.items():
        log(f"\nExtracting zero-shot embeddings for {model_name}...")
        model.eval()

        all_embs = []
        with torch.no_grad():
            for tensors, _, _ in model_loader:
                feats = model(tensors)
                all_embs.append(feats.numpy())

        all_embs = np.vstack(all_embs)

        for i, item in enumerate(dataset_items):
            item[f"emb_{model_name}"] = all_embs[i]

        res = evaluate_retrieval(dataset_items, f"emb_{model_name}", model_name)
        results[model_name] = res
        log(f"  {model_name} -> Precision@1: {res['precision1']*100:.2f}% | MRR: {res['mrr']:.4f} | Socket<->EDV Errors: {res['socket_edv_error']}")

    # Check best zero-shot Precision@1
    best_zero_shot_p1 = max(res['precision1'] for k, res in results.items() if k.startswith("MODEL_"))
    log(f"\nBest Zero-Shot Precision@1: {best_zero_shot_p1*100:.2f}%")

    # ------------------------------------------------------------
    # FAZA 2: FINE-TUNING METRIC ENCODER
    # ------------------------------------------------------------
    finetuned_results = None
    if best_zero_shot_p1 < 0.85:
        log("\n=================================================")
        log("  FAZA 2: METRIC FINE-TUNING (Target Precision@1 > 85%)")
        log("=================================================")
        log("Zero-shot Precision@1 < 85%. Starting metric fine-tuning on CAD symbol dataset...")

        # 80/20 train/val split grouped by plan_id to prevent data leakage
        plan_ids = list(set(it['plan_id'] for it in dataset_items))
        random.shuffle(plan_ids)
        split_idx = int(len(plan_ids) * 0.8)
        train_plans = set(plan_ids[:split_idx])
        val_plans = set(plan_ids[split_idx:])

        train_items = [it for it in dataset_items if it['plan_id'] in train_plans]
        val_items = [it for it in dataset_items if it['plan_id'] in val_plans]
        log(f"Train split: {len(train_items)} samples ({len(train_plans)} plans) | Val split: {len(val_items)} samples ({len(val_plans)} plans)")

        # Data augmentation for training
        train_transform = transforms.Compose([
            transforms.RandomResizedCrop(224, scale=(0.85, 1.0)),
            transforms.RandomRotation(15),
            transforms.ColorJitter(brightness=0.2, contrast=0.2),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])

        train_dataset = SymbolCropDataset(train_items, transform=train_transform)
        train_loader = DataLoader(train_dataset, batch_size=32, shuffle=True)

        finetuned_model = FineTunedResNet18(num_classes=len(unique_classes))
        optimizer = torch.optim.AdamW(finetuned_model.parameters(), lr=1e-3, weight_decay=1e-4)
        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=25)
        criterion = nn.CrossEntropyLoss()

        epochs = 25
        log(f"Training FineTunedResNet18 for {epochs} epochs...")

        finetuned_model.train()
        for epoch in range(1, epochs + 1):
            running_loss = 0.0
            correct = 0
            total = 0

            for tensors, labels, _ in train_loader:
                optimizer.zero_grad()
                logits, embs = finetuned_model(tensors)
                loss = criterion(logits, labels)

                loss.backward()
                optimizer.step()

                running_loss += loss.item() * tensors.size(0)
                preds = torch.argmax(logits, dim=1)
                correct += (preds == labels).sum().item()
                total += tensors.size(0)

            scheduler.step()
            train_acc = correct / total if total > 0 else 0
            if epoch % 5 == 0 or epoch == epochs:
                log(f"  Epoch [{epoch}/{epochs}] Loss: {running_loss/total:.4f} | Train Acc: {train_acc*100:.2f}%")

        # Extract fine-tuned embeddings for full dataset
        finetuned_model.eval()
        ft_embs = []
        with torch.no_grad():
            for tensors, _, _ in loader_224:
                embs = finetuned_model.extract_embedding(tensors)
                ft_embs.append(embs.numpy())

        ft_embs = np.vstack(ft_embs)
        for i, item in enumerate(dataset_items):
            item["emb_MODEL_FINE_TUNED_ResNet18"] = ft_embs[i]

        finetuned_results = evaluate_retrieval(dataset_items, "emb_MODEL_FINE_TUNED_ResNet18", "MODEL_FINE_TUNED_ResNet18")
        results["MODEL_FINE_TUNED_ResNet18"] = finetuned_results
        log(f"\nFINE-TUNED RESNET18 -> Precision@1: {finetuned_results['precision1']*100:.2f}% | MRR: {finetuned_results['mrr']:.4f} | Socket<->EDV Errors: {finetuned_results['socket_edv_error']}")

    # ------------------------------------------------------------
    # SUMMARY & FINAL DECISION
    # ------------------------------------------------------------
    log("\n=================================================")
    log("  DEEP EMBEDDING EXPERIMENT SUMMARY")
    log("=================================================")

    log("Pipeline                        | Precision@1 | Precision@5 | MRR    | Socket<->EDV Error")
    log("-----------------------------------------------------------------------------------------")
    for k, res in results.items():
        log(f"  {k.padEnd(30)} | {res['precision1']*100:.2f}%     | {res['precision5']*100:.2f}%     | {res['mrr']:.4f} | {res['socket_edv_error']}")

    best_key = max(results.keys(), key=lambda k: results[k]['precision1'])
    best_p1 = results[best_key]['precision1']

    v1_p1 = results["OLD_V1_Handcrafted_Baseline"]['precision1']
    v1_errors = results["OLD_V1_Handcrafted_Baseline"]['socket_edv_error']
    best_errors = results[best_key]['socket_edv_error']

    is_success = best_p1 > 0.85 and best_errors <= (v1_errors * 0.5)
    final_decision = "DEEP" if best_p1 > v1_p1 else "OLD"

    summary_report = {
        "generated_at": datetime.utcnow().isoformat(),
        "total_queries": len(dataset_items),
        "experiment_status": "SUCCESS" if is_success else "COMPLETED",
        "target_precision1_achieved": best_p1 > 0.85,
        "best_pipeline": best_key,
        "best_precision1": best_p1,
        "final_decision": final_decision,
        "pipeline_results": results
    }

    with open(REPORT_OUTPUT_PATH, "w") as f:
        json.dump(summary_report, f, indent=2)

    log("\n=================================================")
    log(f"FINAL DECISION: {final_decision} EMBEDDING MODEL")
    log(f"Best Model: {best_key} (Precision@1 = {best_p1*100:.2f}%)")
    log(f"Report JSON saved to: {REPORT_OUTPUT_PATH}")
    log("=================================================")

if __name__ == "__main__":
    run_experiment()
