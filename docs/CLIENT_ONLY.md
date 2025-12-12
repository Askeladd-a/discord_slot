# Client-only Slot — Running & Auditing

This repository includes a single-file client (`index.html`) implementing a Reels payline slot (5×3, 10 paylines) and a small Node simulator `simulate_reels.js` to estimate RTP.

Files
- `index.html` — client UI and game logic (seedable PRNG).
- `simulate_reels.js` — Node Monte‑Carlo simulator for the Reels mode.

Quick start
1. Open `index.html` in a browser (double-click or serve via local static server).
2. Use the `Randomize` button to generate a random seed, or paste a 32‑hex seed into the field and `Import Seed` to reproduce behavior.
3. Press `SPIN` to play. Use `Export Seed` to copy the current seed to your clipboard for sharing.

Simulator usage

Requirements: Node.js (16+ recommended).

Run a quick simulation (100k spins):

```pwsh
node simulate_reels.js --spins 100000
```

Run with a specific seed (reproducible strips and RNG):

```pwsh
node simulate_reels.js --spins 100000 --seed 0123456789abcdef0123456789abcdef
```

Output example:
```
spins=100000 seed=0123... totalBet=100000.00 totalPayout=96012.34 RTP=96.0123%
```

Notes on reproducibility
- The client and simulator use the same xoshiro-like PRNG algorithm. To reproduce session results exactly: export the seed from the client (`Export Seed`) and pass it to the simulator with `--seed`.
- The simulator generates deterministic reel strips once per seed to match client behavior.

If you want, I can run a simulation for you (pick a spins count) and report the RTP and basic statistics.