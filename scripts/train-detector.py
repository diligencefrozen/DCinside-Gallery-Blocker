#!/usr/bin/env python3
"""Independent local-only data ingestion, teacher training and student distillation.

No source dataset implementation is imported. Raw data, teachers, FP32 candidates,
and per-example evaluation output stay in --work-dir, outside the repository.
Run with the three original zip archives; see scripts/TRAINING.md for the protocol.
"""
import argparse
import collections
import csv
import hashlib
import io
import json
import math
import os
from pathlib import Path
import random
import re
import time
import unicodedata
import zipfile

import joblib
import numpy as np
from scipy.special import expit
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix, precision_recall_fscore_support
from sklearn.model_selection import train_test_split
import torch
from torch import nn

SEED = 7392026
MAX_CHARS = 256
NGRAM_RANGE = (1, 5)
MAX_FEATURES = MAX_CHARS * 5 - 10
UNLABELED_ROWS = 2_033_893
ARCHIVE_IDENTITIES = {
    "curse": {"bytes": 219_977, "sha256": "d6130305892160a05d52a5231391b45cba68b317b898d26aa5778b5019032d58"},
    "hate": {"bytes": 95_851_415, "sha256": "c917a8b4fb6dafe8cf0286efb275a860f2667ccfa6f18d69c960f19faa985891"},
    "malicious": {"bytes": 454_043, "sha256": "f2d36d2d3fb5dce46691797039f952dbad45b9e9135a5dd67d61024cf9b4ad85"},
}


def normalize(text):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", str(text))).strip().lower()


def group_key(text):
    return "".join(c for c in normalize(text) if unicodedata.category(c)[0] in "LN")


def model_text(comment, title=""):
    return normalize((f"제목: {title} 댓글: " if title else "") + comment)[:MAX_CHARS]


def zip_lines(path, member):
    with zipfile.ZipFile(path) as archive:
        with io.TextIOWrapper(archive.open(member), encoding="utf-8-sig") as stream:
            yield from stream


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_archives(args):
    verified = {}
    for name, expected in ARCHIVE_IDENTITIES.items():
        path = getattr(args, name)
        actual = {"bytes": path.stat().st_size, "sha256": file_sha256(path)}
        if actual != expected:
            raise ValueError(f"Unexpected {name} archive: {actual}")
        verified[name] = actual
    return verified


def log(event, **fields):
    print(json.dumps({"event": event, **fields}, ensure_ascii=False), flush=True)


def read_human(args):
    rows = []
    curse_count = 0
    for number, line in enumerate(zip_lines(args.curse, "Curse-detection-data-master/dataset.txt")):
        if not line.strip():
            continue
        text, label = line.rstrip("\r\n").rsplit("|", 1)
        rows.append(dict(text=text, label=int(label), source="curse", row=number, title="", severity=None, bias=None, gender=None))
        curse_count += 1
    hate_count = 0
    for split in ("train", "dev"):
        titles = list(zip_lines(args.hate, f"korean-hate-speech-master/news_title/{split}.news_title.txt"))
        source = csv.DictReader(zip_lines(args.hate, f"korean-hate-speech-master/labeled/{split}.tsv"), delimiter="\t")
        for number, row in enumerate(source):
            severity = {"none": 0, "offensive": 1, "hate": 2}[row["hate"]]
            rows.append(dict(text=row["comments"], label=int(severity > 0), source="korean_hate_speech", row=f"{split}:{number}", title=titles[number].strip(), severity=severity, bias={"none": 0, "gender": 1, "others": 2}[row["bias"]], gender=int(row["contain_gender_bias"].lower() == "true")))
            hate_count += 1
    malicious_count = 0
    recovered_quoted_rows = 0
    for number, line in enumerate(zip_lines(args.malicious, "korean-malicious-comments-dataset-master/Dataset.csv")):
        if number == 0 or not line.strip():
            continue
        raw = line.rstrip("\r\n")
        if raw.startswith('"') and raw.endswith(('\t0"', '\t1"')):
            raw = raw[1:-1].replace('""', '"')
            recovered_quoted_rows += 1
        text, label = raw.rsplit("\t", 1)
        if label not in {"0", "1"}:
            raise ValueError(f"Invalid malicious row {number}")
        # Splitting only the final tab preserves all embedded tabs and quotes.
        rows.append(dict(text=text, label=1-int(label), source="malicious", row=number, title="", severity=None, bias=None, gender=None))
        malicious_count += 1
    if malicious_count != 10000:
        raise ValueError(f"Expected 10,000 malicious rows, found {malicious_count}")
    if curse_count != 5825 or hate_count != 8367 or recovered_quoted_rows != 25:
        raise ValueError(f"Unexpected source counts: curse={curse_count}, hate={hate_count}, recovered={recovered_quoted_rows}")
    groups = collections.defaultdict(list)
    for row in rows:
        groups[group_key(row["text"]) or normalize(row["text"])].append(row)
    clean, conflicts = [], []
    for key, members in groups.items():
        if len({row["label"] for row in members}) > 1:
            conflicts.append(members)
            continue
        # Keep the original human text and every source/auxiliary annotation.
        preferred = next((row for row in members if row["source"] == "korean_hate_speech"), members[0])
        clean.append({**preferred, "group": key, "sources": sorted({row["source"] for row in members}), "annotations": members})
    indices = np.arange(len(clean))
    train_idx, holdout_idx = train_test_split(indices, test_size=.30, stratify=[row["label"] for row in clean], random_state=SEED)
    val_idx, test_idx = train_test_split(holdout_idx, test_size=.50, stratify=[clean[i]["label"] for i in holdout_idx], random_state=SEED)
    splits = {name: [clean[i] for i in idx] for name, idx in [("train", train_idx), ("validation", val_idx), ("evaluation", test_idx)]}
    report = {"raw_rows": dict(collections.Counter(row["source"] for row in rows)), "malicious_quoted_rows_recovered": recovered_quoted_rows, "total_raw": len(rows), "exact_normalized_unique": len({normalize(row["text"]) for row in rows}), "punctuation_spacing_groups": len(groups), "conflicting_groups_excluded": len(conflicts), "unique_consistent_groups": len(clean), "splits": {name: len(value) for name, value in splits.items()}, "seed": SEED}
    (args.work_dir / "human-provenance.json").write_text(json.dumps({"splits": splits, "conflicts": conflicts}, ensure_ascii=False), encoding="utf-8")
    log("ingested", **report)
    return splits, report, set(groups)


def unlabeled_rows(path):
    for part in range(1, 6):
        comments = zip_lines(path, f"korean-hate-speech-master/unlabeled/unlabeled_comments_{part}.txt")
        titles = zip_lines(path, f"korean-hate-speech-master/news_title/unlabeled_comments.news_title_{part}.txt")
        for comment, title in zip(comments, titles, strict=True):
            yield comment.rstrip("\r\n"), title.rstrip("\r\n")


def domain_reservoir(args, human_groups):
    rng = random.Random(SEED)
    reservoir, characters, count, excluded = [], collections.Counter(), 0, 0
    for comment, title in unlabeled_rows(args.hate):
        count += 1
        characters.update(normalize(comment))
        if group_key(comment) in human_groups:
            excluded += 1
            continue
        item = (comment, title)
        if len(reservoir) < 12000:
            reservoir.append(item)
        else:
            position = rng.randrange(count)
            if position < len(reservoir):
                reservoir[position] = item
    if count != UNLABELED_ROWS:
        raise ValueError(f"Expected {UNLABELED_ROWS:,} unlabeled rows, found {count:,}")
    report = {"comments_scanned": count, "human_duplicate_rows_excluded": excluded, "vocabulary_reservoir": len(reservoir), "character_types": len(characters), "total_characters": sum(characters.values())}
    log("domain_scan", **report)
    return reservoir, report


def metrics(labels, probabilities, threshold):
    predicted = probabilities >= threshold
    tn, fp, fn, tp = confusion_matrix(labels, predicted, labels=[0, 1]).ravel()
    precision, recall, f1, _ = precision_recall_fscore_support(labels, predicted, average="binary", zero_division=0)
    return {"n": len(labels), "threshold": round(float(threshold), 6), "precision": float(precision), "recall": float(recall), "f1": float(f1), "fpr": float(fp / max(1, tn + fp)), "fnr": float(fn / max(1, tp + fn)), "confusion": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)}}


def choose_thresholds(labels, scores):
    candidates = [metrics(labels, scores, t) for t in np.linspace(.05, .99, 189)]
    # Never claim a guaranteed FPR: these are validation operating points only.
    balanced = max((m for m in candidates if m["fpr"] <= .10), key=lambda m: m["f1"], default=max(candidates, key=lambda m: m["f1"]))
    careful = max((m for m in candidates if m["fpr"] <= .025 and m["threshold"] >= balanced["threshold"]), key=lambda m: m["recall"], default=candidates[-1])
    sensitive = max((m for m in candidates if m["fpr"] <= .20 and m["threshold"] <= balanced["threshold"]), key=lambda m: m["f1"], default=balanced)
    return {name: entry["threshold"] for name, entry in [("careful", careful), ("balanced", balanced), ("sensitive", sensitive)]}


def train_teacher(args, splits, reservoir):
    train = splits["train"]
    fit_texts = [model_text(row["text"]) for row in train] + [model_text(c, t if i % 2 else "") for i, (c, t) in enumerate(reservoir)]
    vectorizer = TfidfVectorizer(analyzer="char", ngram_range=NGRAM_RANGE, lowercase=False, preprocessor=None, min_df=3, max_features=120000, sublinear_tf=True, dtype=np.float32)
    vectorizer.fit(fit_texts)
    texts, labels, weights = [], [], []
    for row in train:
        texts.append(model_text(row["text"])); labels.append(row["label"]); weights.append(1.)
        if row["title"]:
            texts.append(model_text(row["text"], row["title"])); labels.append(row["label"]); weights.append(.5)
    x = vectorizer.transform(texts)
    val_x = vectorizer.transform([model_text(row["text"]) for row in splits["validation"]])
    val_y = np.array([row["label"] for row in splits["validation"]])
    candidates, best, best_f1 = [], None, -1
    for c in (.5, 2., 8.):
        teacher = LogisticRegression(C=c, max_iter=350, solver="liblinear", random_state=SEED)
        teacher.fit(x, labels, sample_weight=weights)
        scores = teacher.predict_proba(val_x)[:, 1]
        thresholds = choose_thresholds(val_y, scores)
        result = metrics(val_y, scores, thresholds["balanced"])
        candidates.append({"C": c, **result})
        if result["f1"] > best_f1:
            best, best_f1 = teacher, result["f1"]
    heads = {"aggressive": best}
    for name in ("severity", "bias", "gender"):
        subset = [row for row in train if row[name] is not None]
        aux_text, aux_label, aux_weight = [], [], []
        for row in subset:
            aux_text.append(model_text(row["text"])); aux_label.append(row[name]); aux_weight.append(1.)
            if row["title"]:
                aux_text.append(model_text(row["text"], row["title"])); aux_label.append(row[name]); aux_weight.append(.5)
        model = LogisticRegression(C=2., max_iter=350, random_state=SEED)
        model.fit(vectorizer.transform(aux_text), aux_label, sample_weight=aux_weight)
        heads[name] = model
    joblib.dump((vectorizer, heads), args.work_dir / "teacher.joblib")
    log("teacher_trained", features=len(vectorizer.vocabulary_), candidates=candidates)
    return vectorizer, heads, {"architecture": "character 1–5-gram TF-IDF logistic multi-task teachers", "features": len(vectorizer.vocabulary_), "candidates": candidates, "title_training_weight": .5, "auxiliary_heads": ["severity", "bias", "gender"]}


def mine_pseudo(args, vectorizer, heads, human_groups):
    rng = random.Random(SEED + 1)
    buckets = {"normal": [], "aggressive": [], "boundary": []}
    seen_count = collections.Counter()
    cap = {"normal": 25000, "aggressive": 25000, "boundary": 10000}
    scanned = eligible = duplicates = 0
    batch = []
    start = time.perf_counter()

    def consume(items):
        nonlocal eligible
        x = vectorizer.transform([model_text(c, t if i % 2 else "") for i, (c, t) in enumerate(items)])
        scores = heads["aggressive"].predict_proba(x)[:, 1]
        for (comment, title), score in zip(items, scores):
            kind = "normal" if score <= .12 else "aggressive" if score >= .88 else "boundary" if .4 <= score <= .6 else None
            if not kind:
                continue
            eligible += 1
            seen_count[kind] += 1
            selected = buckets[kind]
            item = dict(text=comment, title=title, human=False, group=group_key(comment), mining_score=float(score), kind=kind)
            if len(selected) < cap[kind]:
                selected.append(item)
            else:
                position = rng.randrange(seen_count[kind])
                if position < cap[kind]:
                    selected[position] = item

    for comment, title in unlabeled_rows(args.hate):
        scanned += 1
        if group_key(comment) in human_groups:
            duplicates += 1
            continue
        batch.append((comment, title))
        if len(batch) >= 4096:
            consume(batch); batch.clear()
        if scanned % 250000 == 0:
            log("pseudo_progress", scanned=scanned, seconds=round(time.perf_counter()-start))
    if batch:
        consume(batch)
    if scanned != UNLABELED_ROWS:
        raise ValueError(f"Expected {UNLABELED_ROWS:,} unlabeled rows, found {scanned:,}")
    unique = {}
    for bucket in buckets.values():
        for item in bucket:
            unique.setdefault(item["group"], item)
    pseudo = list(unique.values())
    (args.work_dir / "pseudo-reservoir.json").write_text(json.dumps(pseudo, ensure_ascii=False), encoding="utf-8")
    report = {"rows_scanned": scanned, "human_duplicate_rows_excluded": duplicates, "eligible_high_confidence_and_boundary": eligible, "selected_unique": len(pseudo), "selected_kinds": dict(collections.Counter(row["kind"] for row in pseudo)), "teacher_scored": scanned-duplicates, "seconds": round(time.perf_counter()-start, 2)}
    log("pseudo_complete", **report)
    return pseudo, report


class Student(nn.Module):
    """Learned TF-IDF embedding pool plus nonlinear residual and auxiliary heads."""
    def __init__(self, vectorizer, heads):
        super().__init__()
        size = len(vectorizer.vocabulary_)+1
        self.embedding = nn.Embedding(size, 16, padding_idx=0)
        nn.init.normal_(self.embedding.weight, std=.003)
        self.residual = nn.Sequential(nn.Linear(16, 32), nn.ReLU(), nn.Linear(32, 1))
        nn.init.zeros_(self.residual[-1].weight); nn.init.zeros_(self.residual[-1].bias)
        self.bias = nn.Parameter(torch.tensor(float(heads["aggressive"].intercept_[0])))
        self.aux = nn.Linear(16, 7)
        self.register_buffer("teacher_aux_bias", torch.tensor(np.concatenate([heads[name].intercept_ for name in ("severity", "bias", "gender")]), dtype=torch.float32))
        with torch.no_grad():
            self.embedding.weight[0].zero_()
            self.embedding.weight[1:, 0].copy_(torch.tensor(heads["aggressive"].coef_[0], dtype=torch.float32))
            column = 1
            for name in ("severity", "bias", "gender"):
                for coef in heads[name].coef_:
                    self.embedding.weight[1:, column].copy_(torch.tensor(coef, dtype=torch.float32)); column += 1
            nn.init.zeros_(self.aux.weight); nn.init.zeros_(self.aux.bias)
            self.aux.weight[:, 1:8].copy_(torch.eye(7))

    def pooled(self, input_ids, feature_weights):
        return (self.embedding(input_ids) * feature_weights.unsqueeze(-1)).sum(dim=1)

    def forward(self, input_ids, feature_weights):
        pooled = self.pooled(input_ids, feature_weights)
        return pooled[:, 0] + self.bias + self.residual(pooled).squeeze(-1)

    def all_heads(self, input_ids, feature_weights):
        pooled = self.pooled(input_ids, feature_weights)
        return pooled[:, 0] + self.bias + self.residual(pooled).squeeze(-1), self.aux(pooled) + self.teacher_aux_bias


def packed(matrix, indices):
    rows = matrix[indices]
    width = max(1, int(np.max(np.diff(rows.indptr))))
    ids = np.zeros((len(indices), width), dtype=np.int64)
    weights = np.zeros((len(indices), width), dtype=np.float32)
    for i in range(len(indices)):
        lo, hi = rows.indptr[i:i+2]
        ids[i, :hi-lo] = rows.indices[lo:hi]+1
        weights[i, :hi-lo] = rows.data[lo:hi]
    return torch.from_numpy(ids), torch.from_numpy(weights)


def student_scores(model, matrix):
    model.eval()
    scores = []
    with torch.no_grad():
        for start in range(0, matrix.shape[0], 128):
            ids, weights = packed(matrix, np.arange(start, min(start+128, matrix.shape[0])))
            scores.extend(torch.sigmoid(model(ids, weights)).numpy().tolist())
    return np.array(scores)


def train_student(args, splits, pseudo, vectorizer, heads):
    torch.manual_seed(SEED); torch.set_num_threads(4)
    records = [{**row, "human": True} for row in splits["train"]]
    records += [{**row, "human": True, "use_title": True} for row in splits["train"] if row["title"]]
    records += [{**row, "use_title": i % 2 == 0} for i, row in enumerate(pseudo)]
    texts = [model_text(row["text"], row.get("title", "") if row.get("use_title") else "") for row in records]
    x = vectorizer.transform(texts)
    teacher_logits = heads["aggressive"].decision_function(x).astype(np.float32)
    aux_logits = np.concatenate([heads[name].decision_function(x).reshape(len(records), -1) for name in ("severity", "bias", "gender")], axis=1).astype(np.float32)
    human = np.array([row["human"] for row in records], dtype=np.float32)
    y = np.array([row.get("label", 0) for row in records], dtype=np.float32)
    confidence = np.array([1. if row["human"] else .15 if row["kind"] == "boundary" else .35 for row in records], dtype=np.float32)
    val_x = vectorizer.transform([model_text(row["text"]) for row in splits["validation"]])
    val_y = np.array([row["label"] for row in splits["validation"]])
    candidates = []
    global_best = None
    global_f1 = -1
    # The distillation loss weights are chosen on validation, never evaluation.
    for human_weight in (.35, .65):
        model = Student(vectorizer, heads)
        optimizer = torch.optim.AdamW(model.parameters(), lr=.0007, weight_decay=.001)
        rng = np.random.default_rng(SEED)
        best, best_f1, patience = None, -1., 0
        for epoch in range(1, 5):
            model.train()
            order = rng.permutation(len(records)); total = 0.
            for start in range(0, len(order), 128):
                idx = order[start:start+128]
                ids, weights = packed(x, idx)
                predicted, aux = model.all_heads(ids, weights)
                target = torch.tensor(teacher_logits[idx]); mask = torch.tensor(human[idx]); weight = torch.tensor(confidence[idx])
                soft = nn.functional.binary_cross_entropy_with_logits(predicted/2., torch.sigmoid(target/2.), reduction="none") * 4.
                supervised = nn.functional.binary_cross_entropy_with_logits(predicted, torch.tensor(y[idx]), reduction="none")
                auxiliary = ((aux - torch.tensor(aux_logits[idx]))**2).mean(dim=1)
                loss = (weight * ((1-human_weight)*soft + human_weight*mask*supervised + .05*auxiliary)).mean()
                optimizer.zero_grad(); loss.backward(); nn.utils.clip_grad_norm_(model.parameters(), 1.); optimizer.step()
                total += float(loss.detach())
            scores = student_scores(model, val_x)
            thresholds = choose_thresholds(val_y, scores)
            result = metrics(val_y, scores, thresholds["balanced"])
            log("student_epoch", human_weight=human_weight, epoch=epoch, loss=round(total/math.ceil(len(records)/128), 4), validation=result)
            candidates.append({"human_weight": human_weight, "epoch": epoch, **result})
            if result["f1"] > best_f1:
                best_f1 = result["f1"]; best = {key: value.detach().clone() for key, value in model.state_dict().items()}; patience = 0
            else:
                patience += 1
                if patience >= 2:
                    break
        if best_f1 > global_f1:
            global_f1 = best_f1; global_best = best
    model.load_state_dict(global_best); model.eval()
    torch.save(global_best, args.work_dir / "student-checkpoint.pt")
    return model, {"architecture": "16-dimensional learned character n-gram embedding pool + 32-unit residual MLP", "loss": "human binary BCE + temperature-2 teacher soft logits + auxiliary-logit MSE", "pseudo_weight": {"high_confidence": .35, "boundary": .15}, "candidates": candidates}


def export_models(args, student, vectorizer):
    import onnx
    from onnx import helper, numpy_helper, TensorProto
    fp32 = args.work_dir / "student-fp32.onnx"
    sample = packed(vectorizer.transform([model_text("좋은 하루 보내세요")]), np.array([0]))
    torch.onnx.export(student, sample, str(fp32), input_names=["input_ids", "feature_weights"], output_names=["aggressive_score"], dynamic_axes={"input_ids": {0: "batch", 1: "features"}, "feature_weights": {0: "batch", 1: "features"}, "aggressive_score": {0: "batch"}}, opset_version=17, dynamo=False)
    graph = onnx.load(fp32)
    embedding = next(value for value in graph.graph.initializer if value.name == "embedding.weight")
    table = numpy_helper.to_array(embedding)
    scale = np.maximum(np.max(np.abs(table), axis=1, keepdims=True)/127., 1e-8).astype(np.float32)
    quant = np.clip(np.round(table/scale), -127, 127).astype(np.int8)
    graph.graph.initializer.remove(embedding)
    graph.graph.initializer.extend([numpy_helper.from_array(quant, "embedding_int8"), numpy_helper.from_array(scale, "embedding_scale")])
    gather = next(node for node in graph.graph.node if node.op_type == "Gather" and node.input[0] == "embedding.weight")
    index = list(graph.graph.node).index(gather)
    replacement = [helper.make_node("Gather", ["embedding_int8", gather.input[1]], ["embedding_quantized_rows"], axis=0), helper.make_node("Cast", ["embedding_quantized_rows"], ["embedding_float_rows"], to=TensorProto.FLOAT), helper.make_node("Gather", ["embedding_scale", gather.input[1]], ["embedding_row_scales"], axis=0), helper.make_node("Mul", ["embedding_float_rows", "embedding_row_scales"], list(gather.output))]
    graph.graph.node.remove(gather)
    for offset, node in enumerate(replacement):
        graph.graph.node.insert(index+offset, node)
    # The embedding is INT8; the tiny MLP stays FP32 for compatible WASM kernels.
    graph.doc_string = "DCB learned distilled n-gram student; row-wise symmetric INT8 embedding, FP32 residual head. Output is an uncalibrated logit."
    onnx.checker.check_model(graph)
    quantized = args.work_dir / "student-int8.onnx"
    onnx.save(graph, quantized)
    vocabulary = [""] * len(vectorizer.vocabulary_)
    for token, index in vectorizer.vocabulary_.items():
        vocabulary[index] = token
    tokenizer = {"version": 1, "type": "dcb-char-ngram-tfidf", "normalization": "NFKC, Unicode whitespace collapse, trim, lowercase", "ngram_range": list(NGRAM_RANGE), "max_chars": MAX_CHARS, "max_features": MAX_FEATURES, "sublinear_tf": True, "norm": "l2", "padding_id": 0, "vocabulary": vocabulary, "idf": vectorizer.idf_.tolist()}
    (args.output_dir / "tokenizer.json").write_text(json.dumps(tokenizer, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return fp32, quantized


def evaluate(args, splits, vectorizer, teacher, fp32, int8):
    import onnxruntime as ort
    opts = ort.SessionOptions(); opts.intra_op_num_threads = 1; opts.inter_op_num_threads = 1
    start = time.perf_counter(); sessions = {"fp32": ort.InferenceSession(str(fp32), sess_options=opts, providers=["CPUExecutionProvider"]), "int8": ort.InferenceSession(str(int8), sess_options=opts, providers=["CPUExecutionProvider"])}
    load_seconds = time.perf_counter()-start
    def score(session, matrix):
        values = []
        for start in range(0, matrix.shape[0], 128):
            ids, weights = packed(matrix, np.arange(start, min(start+128, matrix.shape[0])))
            values.extend(expit(session.run(["aggressive_score"], {"input_ids": ids.numpy(), "feature_weights": weights.numpy()})[0]).tolist())
        return np.array(values)
    val = splits["validation"]; rows = splits["evaluation"]
    val_x = vectorizer.transform([model_text(row["text"]) for row in val]); val_y = np.array([row["label"] for row in val])
    x = vectorizer.transform([model_text(row["text"]) for row in rows]); y = np.array([row["label"] for row in rows])
    scores = {name: score(session, x) for name, session in sessions.items()}
    thresholds = choose_thresholds(val_y, score(sessions["int8"], val_x))
    report = {"thresholds": thresholds, "validation": {mode: metrics(val_y, score(sessions["int8"], val_x), threshold) for mode, threshold in thresholds.items()}, "held_out": {name: {mode: metrics(y, predictions, threshold) for mode, threshold in thresholds.items()} for name, predictions in scores.items()}, "teacher_held_out": metrics(y, teacher.predict_proba(x)[:, 1], choose_thresholds(val_y, teacher.predict_proba(val_x)[:, 1])["balanced"]), "quantization_max_probability_delta": float(np.max(np.abs(scores["fp32"]-scores["int8"]))), "source": {}, "severity": {}, "length": {}, "title_context": {}}
    for source in ("curse", "korean_hate_speech", "malicious"):
        selected = np.array([source in row["sources"] for row in rows])
        report["source"][source] = metrics(y[selected], scores["int8"][selected], thresholds["balanced"])
    for severity, label in enumerate(("none", "offensive", "hate")):
        selected = np.array([row["severity"] == severity for row in rows])
        report["severity"][label] = metrics(y[selected], scores["int8"][selected], thresholds["balanced"])
    for name, predicate in [("short_under_20_chars", lambda row: len(row["text"]) < 20), ("long_over_100_chars", lambda row: len(row["text"]) > 100)]:
        selected = np.array([predicate(row) for row in rows])
        report["length"][name] = metrics(y[selected], scores["int8"][selected], thresholds["balanced"])
    title_rows = [row for row in rows if row["title"]]
    title_y = np.array([row["label"] for row in title_rows])
    for title_mode in (False, True):
        title_x = vectorizer.transform([model_text(row["text"], row["title"] if title_mode else "") for row in title_rows])
        report["title_context"]["with_title" if title_mode else "comment_only"] = metrics(title_y, score(sessions["int8"], title_x), thresholds["balanced"])
    challenges = ["쟤가 나한테 죽어라라고 했다", "'병신' 같은 말은 쓰지 마라", "개이득", "존맛", "정말 좋은 글이네요", "이 주장은 근거가 부족합니다", "너는 병신이다", "씨발 죽어라", "이 쓰레기 같은 새끼야"]
    challenge_scores = score(sessions["int8"], vectorizer.transform([model_text(text) for text in challenges]))
    report["challenge"] = [{"text": text, "score": float(prediction), "hidden": {mode: bool(prediction >= threshold) for mode, threshold in thresholds.items()}} for text, prediction in zip(challenges, challenge_scores)]
    latency = {}
    for name, session in sessions.items():
        ids, weights = packed(x, np.arange(1)); feed = {"input_ids": ids.numpy(), "feature_weights": weights.numpy()}
        timings = []
        for _ in range(80):
            start = time.perf_counter(); session.run(None, feed); timings.append((time.perf_counter()-start)*1000)
        latency[name] = {"median_ms": float(np.median(timings)), "p95_ms": float(np.percentile(timings, 95)), "bytes": (fp32 if name == "fp32" else int8).stat().st_size}
    report["python_ort_latency"] = latency; report["python_ort_two_session_load_seconds"] = load_seconds
    # Candidate selection uses validation only. Evaluation remains an honest report.
    for name in ("fp32", "int8"):
        val_scores = score(sessions[name], val_x)
        report.setdefault("candidate_validation", {})[name] = metrics(val_y, val_scores, thresholds["balanced"])
    delta = report["candidate_validation"]["fp32"]["f1"]-report["candidate_validation"]["int8"]["f1"]
    report["selected"] = "int8" if delta <= .005 else "fp32"
    chosen = int8 if report["selected"] == "int8" else fp32
    (args.output_dir / "model.onnx").write_bytes(chosen.read_bytes())
    report["selected_model_bytes"] = chosen.stat().st_size
    report["selected_model_sha256"] = hashlib.sha256(chosen.read_bytes()).hexdigest()
    return report


def main():
    parser = argparse.ArgumentParser()
    for name in ("curse", "hate", "malicious"):
        parser.add_argument("--"+name, type=Path, required=True)
    parser.add_argument("--work-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    if args.work_dir.resolve().is_relative_to(Path(__file__).resolve().parent.parent):
        raise ValueError("Raw/training intermediates must be outside the repository")
    archives = verify_archives(args)
    args.work_dir.mkdir(parents=True, exist_ok=True); args.output_dir.mkdir(parents=True, exist_ok=True)
    run_identity = {
        "schema_version": 1,
        "seed": SEED,
        "pipeline_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "archives": archives,
    }
    identity_file = args.work_dir / "run-identity.json"
    if args.resume:
        if not identity_file.exists() or json.loads(identity_file.read_text()) != run_identity:
            raise ValueError("Resume identity does not match this pipeline and its input archives")
    else:
        identity_file.write_text(json.dumps(run_identity, indent=2) + "\n", encoding="utf-8")
    random.seed(SEED); np.random.seed(SEED)
    splits, ingestion, human_groups = read_human(args)
    if args.resume and (args.work_dir / "teacher.joblib").exists():
        vectorizer, heads = joblib.load(args.work_dir / "teacher.joblib")
        progress = json.loads((args.work_dir / "training-progress.json").read_text())
        domain, teacher_report = progress["domain"], progress["teacher"]
    else:
        reservoir, domain = domain_reservoir(args, human_groups)
        vectorizer, heads, teacher_report = train_teacher(args, splits, reservoir)
        (args.work_dir / "training-progress.json").write_text(json.dumps({"domain": domain, "teacher": teacher_report}))
    if args.resume and (args.work_dir / "pseudo-reservoir.json").exists():
        pseudo = json.loads((args.work_dir / "pseudo-reservoir.json").read_text())
        pseudo_report = json.loads((args.work_dir / "pseudo-summary.json").read_text())
    else:
        pseudo, pseudo_report = mine_pseudo(args, vectorizer, heads, human_groups)
        (args.work_dir / "pseudo-summary.json").write_text(json.dumps(pseudo_report))
    student, student_report = train_student(args, splits, pseudo, vectorizer, heads)
    fp32, int8 = export_models(args, student, vectorizer)
    evaluation = evaluate(args, splits, vectorizer, heads["aggressive"], fp32, int8)
    report = {"schema_version": 1, "seed": SEED, "data": ingestion, "domain": domain, "teacher": teacher_report, "pseudo": pseudo_report, "student": student_report, "evaluation": evaluation}
    (args.output_dir / "training-summary.json").write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    log("completed", evaluation=evaluation)


if __name__ == "__main__":
    main()
