# Gravemarch (working title)

A browser-based "line wars" RTS in a gothic dark-fantasy setting, with a 3D elevated camera, original art and synthesized sound.

You earn income, raise production buildings that send a unit down your lane every wave, and fight over shrines for extra income. The armies fight on their own. Your decisions are economy, army composition, placement and timing, and you win by destroying the enemy cathedral. Matches run 1v1, 2v2 or 3v3 with one lane per player, against AI or online.

It is inspired by the StarCraft II Arcade map Colonial Line Wars, which is the reference for how the game should feel. Names, art, sounds and stats are all original.

> **Work in progress.** This is an early, actively changing project. Balance, UI and features move constantly, and things will be rough or broken.

## Run it

```bash
npm install
npm run dev:all      # client on :5173 and match server on :8788
```

Open http://localhost:5173 and play as a guest. Use `npm run dev` for the client alone (vs AI), `npm test` for the simulation tests, and `npm run check` for type check, tests and build.

## Where to look

- [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md): what is implemented today
- [docs/UNITS.md](docs/UNITS.md): every unit, its ability and counters
- [docs/ROADMAP.md](docs/ROADMAP.md): what is planned next
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how it is built
- [AGENTS.md](AGENTS.md): rules for anyone (human or agent) changing the code
