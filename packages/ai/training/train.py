"""
NNUE training for the Damath AI opponent — offline tooling, GPU-accelerated via CUDA
when available. Consumes NDJSON self-play data exported by generate-selfplay.ts (one
JSON object per line: {"features": number[192], "outcome": -1|0|1}), trains a tiny
value network per variant (model.py), and exports the trained weights as plain JSON to
packages/ai/src/nnue-weights/<variant>.json for packages/ai/src/nnueEval.ts to load.
PyTorch itself never ships — only the exported JSON does.

Usage:
    python train.py --variant whole --epochs 30
    python train.py --all --epochs 30
"""
import argparse
import json
from pathlib import Path

import torch
from torch.utils.data import DataLoader, Dataset, random_split

from model import DamathNNUE

VARIANTS = ["whole", "counting", "integer", "fraction", "rational", "radical", "polynomial"]
HERE = Path(__file__).parent
DATA_DIR = HERE / "data"
CHECKPOINT_DIR = HERE / "checkpoints"
WEIGHTS_DIR = HERE.parent / "src" / "nnue-weights"


class SelfPlayDataset(Dataset):
    def __init__(self, path: Path) -> None:
        self.examples: list[tuple[list[float], float]] = []
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                obj = json.loads(line)
                self.examples.append((obj["features"], obj["outcome"]))

    def __len__(self) -> int:
        return len(self.examples)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        features, outcome = self.examples[idx]
        return torch.tensor(features, dtype=torch.float32), torch.tensor(outcome, dtype=torch.float32)


def train_one_variant(variant: str, epochs: int, batch_size: int, lr: float, device: torch.device) -> None:
    data_path = DATA_DIR / f"{variant}.ndjson"
    if not data_path.exists():
        print(f"[{variant}] no data at {data_path}, skipping (run generate-selfplay.ts first)")
        return

    dataset = SelfPlayDataset(data_path)
    if len(dataset) < 50:
        print(f"[{variant}] only {len(dataset)} examples, skipping (too little data)")
        return

    val_size = max(1, int(len(dataset) * 0.1))
    train_size = len(dataset) - val_size
    train_ds, val_ds = random_split(dataset, [train_size, val_size], generator=torch.Generator().manual_seed(0))
    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size)

    model = DamathNNUE().to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)
    loss_fn = torch.nn.MSELoss()

    best_val_loss = float("inf")
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)

    for epoch in range(1, epochs + 1):
        model.train()
        train_loss_total = 0.0
        for features, outcomes in train_loader:
            features, outcomes = features.to(device), outcomes.to(device)
            optimizer.zero_grad()
            preds = model(features)
            loss = loss_fn(preds, outcomes)
            loss.backward()
            optimizer.step()
            train_loss_total += loss.item() * features.size(0)
        train_loss = train_loss_total / train_size

        model.eval()
        val_loss_total = 0.0
        with torch.no_grad():
            for features, outcomes in val_loader:
                features, outcomes = features.to(device), outcomes.to(device)
                preds = model(features)
                val_loss_total += loss_fn(preds, outcomes).item() * features.size(0)
        val_loss = val_loss_total / val_size

        if epoch % 5 == 0 or epoch == epochs:
            print(f"[{variant}] epoch {epoch}/{epochs}  train_loss={train_loss:.4f}  val_loss={val_loss:.4f}")

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            torch.save(model.state_dict(), CHECKPOINT_DIR / f"{variant}_best.pt")
            with open(WEIGHTS_DIR / f"{variant}.json", "w", encoding="utf-8") as f:
                json.dump(model.export_weights(), f)

    print(f"[{variant}] done. best_val_loss={best_val_loss:.4f} -> {WEIGHTS_DIR / f'{variant}.json'}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--variant", type=str, default=None)
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--lr", type=float, default=1e-3)
    args = parser.parse_args()

    if not args.all and not args.variant:
        raise SystemExit("Pass --variant <id> or --all")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Training on: {device}")
    if device.type == "cuda":
        print(f"  GPU: {torch.cuda.get_device_name(0)}")

    for variant in (VARIANTS if args.all else [args.variant]):
        train_one_variant(variant, args.epochs, args.batch_size, args.lr, device)


if __name__ == "__main__":
    main()
