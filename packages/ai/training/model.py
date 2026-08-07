"""
The Damath NNUE value network — offline training tooling only, never shipped.

192 -> 64 -> 32 -> 1, ReLU hidden layers, tanh output (bounded to [-1, 1], matching the
{-1, 0, 1} self-play outcome labels generate-selfplay.ts produces). Much smaller than
reference/damath-engine's 256/128/64 net: this trains from one session's self-play
budget, not a long-running GPU cluster job, and a smaller net both trains more reliably
on a smaller dataset and keeps the exported weight JSON small enough to ship to a
browser Worker per variant.

The 192-dim input must stay in exact sync with
packages/ai/src/nnueFeatures.ts's encodeNnueFeatures() — that TypeScript function is
the single source of truth for what each of the 192 numbers means; this file only
consumes vectors already produced in that shape.
"""
import torch
import torch.nn as nn

INPUT_SIZE = 192
HIDDEN_1 = 64
HIDDEN_2 = 32


class DamathNNUE(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(INPUT_SIZE, HIDDEN_1),
            nn.ReLU(),
            nn.Linear(HIDDEN_1, HIDDEN_2),
            nn.ReLU(),
            nn.Linear(HIDDEN_2, 1),
            nn.Tanh(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x).squeeze(-1)

    def export_weights(self) -> dict:
        """
        Plain nested lists, matching packages/ai/src/nnueEval.ts's expected schema
        exactly. `nn.Linear(in, out).weight` is `[out, in]` (PyTorch's own convention),
        so `w1[j]` is already the weight row for output neuron `j` dotted against the
        192-dim input -- nnueEval.ts's forward pass mirrors this layout directly rather
        than transposing.
        """
        linear1, _relu1, linear2, _relu2, linear3, _tanh = self.net
        return {
            "version": 1,
            "inputSize": INPUT_SIZE,
            "w1": linear1.weight.detach().cpu().tolist(),
            "b1": linear1.bias.detach().cpu().tolist(),
            "w2": linear2.weight.detach().cpu().tolist(),
            "b2": linear2.bias.detach().cpu().tolist(),
            "w3": linear3.weight.detach().cpu().tolist(),
            "b3": linear3.bias.detach().cpu().tolist(),
        }
