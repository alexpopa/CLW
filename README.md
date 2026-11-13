# Gravemarch (working title)

Browser RTS inspired by the StarCraft II Arcade map Colonial Line Wars. The supplied research describes a 3v3 strategy game where production buildings send recurring waves down three lanes, armies fight automatically, and teams compete for territory and the opposing colony. Players focus on economy, army composition, placement, and timing. See the [Colonial Line Wars research and recreation specification](docs/COLONIAL_LINE_WARS.md) for the original-game overview, proposed mechanics, and verification notes.

The current build is Phase 1 of that specification: a complete 1v1 match against AI on one lane, in an original gothic dark-fantasy setting with a 3D presentation. The [game design notes](docs/GAME_DESIGN.md) describe exactly what is implemented.

See [AGENTS.md](AGENTS.md) for rules, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design, [docs/ROADMAP.md](docs/ROADMAP.md) for what to build next.

```bash
npm install && npm run dev      # open http://localhost:5173 — play a 1v1 match against the AI
npm test                        # sim determinism tests
```
The local client opens directly as a guest. See the [game client handoff](docs/handoff/FABLE.md#test-as-a-guest) for dev and production preview commands.

Status: Phase 1 playable. One lane, two cathedrals, three shrines, six units in two tiers, production waves every 30 s, income, tithe (investment), research, an autopilot AI, win/lose and restart. All art, models and sound are original and generated in code; nothing is taken from StarCraft or any other game. Next: three lanes and 2v2/3v3 (Phase 2).

The first solo playtest targets [ChatGPT Sites](docs/DEPLOYMENT.md). For player accounts, see the [RGBoner sign-in flow](docs/AUTH.md). Claude, Codex, and other agents start with the same [AGENTS.md](AGENTS.md).

## Continue from Codex Remote

In the ChatGPT mobile app, open Codex (called Remote in some versions), select the connected Mac, and look for **CLW**. The saved host project uses `/Users/alexandrupopa/Documents/projects/claude/CLW`. You can also continue this project's existing chat from the host's recent chats. The Mac needs to be awake, online, and running the signed-in desktop app. See [OpenAI's Remote connections guide](https://learn.chatgpt.com/docs/remote-connections).

For authorized development sessions, use full filesystem access and approval policy `never` where available. This README does not set session permissions.
