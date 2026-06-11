# Supabase Setup

This app now uses Supabase for live rooms, players, answers, and votes.

## 1. Create a Supabase project

Create a new project in Supabase and open the SQL Editor.

## 2. Run the schema

Run the SQL in [supabase/schema.sql](./supabase/schema.sql).

This creates:

- `rooms`
- `players`
- `answers`
- `votes`

It also enables row-level security and adds broad demo policies so the current MVP works with the public anon key.

## 3. Turn on Realtime

In Supabase, enable Realtime for these tables:

- `rooms`
- `players`
- `answers`
- `votes`

Without this, the room will still work, but players will need refreshes to see updates.

## 4. Add environment variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

## 5. Install dependencies

```bash
npm install
```

## Notes

- This is a demo-friendly setup, not a locked-down production security model.
- The app currently uses client-generated player IDs and does not require auth.
- The live multiplayer flow is:
  - create or join a room
  - host chooses a category
  - host starts a round
  - everyone submits an answer
  - everyone votes anonymously
  - the room sees shared results

## Production hardening later

If you take this beyond demo stage, the next things to add are:

- Supabase Auth
- stricter RLS tied to authenticated users
- server-side validation for host-only actions
- cleanup jobs for stale rooms
- stronger concurrency handling for simultaneous room actions
