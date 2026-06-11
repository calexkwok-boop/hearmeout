# Hear Me Out 🎮

> The party game of persuasion & personality

## Quick Start

```bash
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173)

## Project Structure

```
hear-me-out/
├── index.html          # Vite entry point
├── vite.config.js      # Vite + React plugin config
├── package.json
└── src/
    ├── main.jsx        # React root mount
    ├── App.jsx         # All screens + game logic
    ├── App.css         # All styles
    └── constants.js    # Players, prompts, awards, colors
```

## Game Flow

1. **Lobby** — pick a category, start the game
2. **Answer** — submit your anonymous answer (30s timer)
3. **Vote** — pick your favorite answer (can't vote for yourself)
4. **Predict** — guess which answer wins the debate (+2 pts if correct)
5. **Reveal** — flip cards to reveal who said what, then each player argues
6. **Re-vote** — vote again; switching = +1 pt, convincing others to switch to you = +2 pts
7. **Awards** — vote on Most Convincing, Funniest, Most Unexpected, Answer I'd Steal
8. **Scoreboard** — see results, pick next category

## Scoring

| Action | Points |
|--------|--------|
| Someone votes for your answer (initial) | +1 |
| Someone switches to your answer (debate) | +2 |
| You change your mind | +1 |
| Correct prediction | +2 |
| Most Convincing award | +2 |
| Funniest Defense award | +1 |
| Most Unexpected award | +1 |
| Answer I'd Steal award | +2 |

## Extending the Game

### Add more prompts
Edit `src/constants.js` → `PROMPTS` object. Each key is a category name, value is an array of prompt strings.

### Add real multiplayer
The game currently runs in single-player demo mode with AI-filled opponents.
To add real multiplayer, replace the `buildAnswers()` function in `App.jsx` with a
real-time backend (e.g. [Firebase Realtime DB](https://firebase.google.com/) or
[PartyKit](https://partykit.io/)) and broadcast answers/votes over WebSockets.

### Add more categories
Add a new key to `PROMPTS` in `constants.js` — the lobby category picker will pick it up automatically.

## Tech Stack

- [React 18](https://react.dev/)
- [Vite](https://vitejs.dev/)
- Google Fonts — Fredoka One + Inter
