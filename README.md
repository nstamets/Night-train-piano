# Night Train 🚂 — family piano app

Version 0.1.0 (Phase 2, delivery 1). Static web app: no build step, no server, no accounts.

## Put it on GitHub Pages

1. On GitHub, create a new **public** repository, e.g. `night-train`.
2. **Add file → Upload files**, and drag in everything from this folder, keeping the folders:
   ```
   index.html
   styles.css
   manifest.webmanifest
   sw.js
   README.md
   CHANGELOG.md
   js/app.js  js/audio.js  js/blocks.js  js/content.js
   js/engine.js  js/notation.js  js/pitch.js  js/storage.js
   icons/icon-192.png  icons/icon-512.png  icons/apple-touch-icon.png
   ```
   (Dragging the `js` and `icons` folders in keeps the structure.)
3. **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `/ (root)` → Save.**
4. After about a minute, the app is at `https://<your-username>.github.io/night-train/`.
5. On each iPhone: open that link in Safari → Share ⬆︎ → **Add to Home Screen** → open it from the Home Screen **before** creating players.

**Updating later:** upload the changed files over the old ones. Progress lives in each phone's storage, not in the files, so updates never touch it. The app shows "A new version is ready" with an Update button.

## How progress stays safe

- Two copies on each device: IndexedDB plus a localStorage mirror. On load, the newer copy wins.
- The app asks the browser for protected (persistent) storage.
- Per-player **backup codes** (copy or share into Notes or email) and **backup files** (save to iCloud Drive).
- A reminder after sessions if the last backup is more than 7 days old. The header pill shows ✓ Progress safe or ! Back up.
- Restoring compares save times and warns before replacing newer progress.
- Every record carries a schema version, and `migrate()` upgrades old records step by step.
- ⚠️ On iPhone, Safari and the Home Screen app have **separate storage**. Use the Home Screen app. To move progress between them, use a backup code.

## Design note: where each teaching principle lives

| Principle | Where in the app |
|---|---|
| Lesson-shaped sessions (10/15/25 min) | `engine.buildSession`: warm-up → technique → new → review → ear/reading/rhythm → play for fun → inspection |
| Every first session plays real music | `buildSession` always includes a playable piece when there is new material |
| Deliberate practice | Piece screen: phrase loops (hardest phrase starred ★ and suggested), Listen, Play along, tempo ladder 60→100% that steps up after **3 clean tries in a row** |
| Spaced and interleaved review | `recordRating` schedules reviews. Gaps stretch for 2–3×/week players (`freqFactor`). Review mixes item types and stations. Blocked practice only on first exposure |
| Feedback | Objective and immediate for rhythm tapping, key quizzes, reading and ear (no mic). Mic inspections judge pitch and rhythm separately, in plain words, with outcome-focused cues ("let the long note ring") |
| Feedback fades | Self-rating carries daily practice. The mic is used only at checkpoints |
| Falling notes → reading | 4 reading-help levels. After 3 clean tries the app suggests less help. **Inspections are always read from notation**, never falling notes. Reading quizzes start at station 3. Clean tries are logged per level (`readingStats`) so the fade is measurable |
| Rhythm apart from pitch | Tap-pad rhythm drills with latency-compensated timing, count-ins and a metronome |
| Ear | Higher/lower, same/different, call-and-response, plus a hint to hum first |
| Technique and health | Posture checklist warm-up, finger numbers and hand shape, a 20-minute stretch reminder, self-check lists (the app can't see hands, and says so) |
| Creativity from day 1 | Black-key improvisation over a pad, call-and-response, compose-your-own tune (saved) |
| Forgiving mastery gate | A station unlocks inspection when its core items reach "nearly" or better. "Nearly" earns a silver stamp; clean earns gold. Retry any time |
| Placement | Reading check plus experience questions. Express pass, mic audition, or ride as review |
| Self-assessment | Skill map with "Can do" and "Still shaky". Self-ratings are compared with mic results, with a gentle note if they drift |
| Autonomy | Pick lines, theme, weekly goal and session length. Practice any item from the station screen |
| No guilt | A weekly goal, not a streak: "Any days you like" |

## Real-device test checklist (iPhone + upright)

1. Install to the Home Screen and create a player. Close the app fully and reopen it: the player is still there.
2. **Sound:** in a lesson slide, tap the keyboard. You should hear the piano. If not, check the **silent switch** (it mutes web audio) and the volume.
3. **Play along:** notes fall in time with the clicks, and the staff cursor follows. Does it feel in sync? Is the latency noticeable?
4. **Rhythm tap:** tap with the clicks. Steady tapping should score "Rock steady". Note it if steady tapping is called rushing or dragging.
5. **Mic setup** (Settings → Redo listening setup), with the phone on the music stand:
   - Does it report hearing Middle C?
   - Note any "cents flat/sharp" message: it tells you if the piano needs tuning.
6. **Quick listen on Up the Steps:** play it correctly. Expect ✓ Clean or ≈ Nearly. Then play one wrong note on purpose: does it name that note?
7. **Repeated notes:** use Clock Tower (C C D). Are both Cs heard?
8. **Soft playing:** play very softly. You should get "I couldn't hear that clearly," not a wrong verdict.
9. **Two people talking nearby** during an inspection: note any false notes.
10. **Mic permission:** does the iPhone ask again on each app launch? (Known iOS behavior. Tell me how often.)
11. **Backup:** make a code → paste it into Notes. Delete the player (Settings), then restore it from the code.
12. **Landscape on the music stand:** can you reach Play along and the rating buttons comfortably?
13. **Two players:** switch players. The session header always shows whose turn it is.
14. **Offline:** turn on airplane mode and open the app. It should still work.

## Limits in this version (honest)

- The mic judges single notes in sequence. Chords and two hands come in later stations.
- Only the Foundations Local (3 stations) exists. The Carol, Gospel, Conservatory and Blue Note lines are next.
- No duets yet, no MIDI yet, no recording or playback yet.
