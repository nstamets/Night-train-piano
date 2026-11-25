# Changelog

## 0.2.0 — 2026-11-25 (Phase 2, delivery 2)
- New lines, one starter station each (they open after Foundations):
  - **Carol Line, Jingle Bells Junction:** Jingle Bells solo; Jingle Bells and Ode to Joy duets with melody, easy bass, or chords parts.
  - **Gospel Line, Chapel Hill and Four Chords Crossing:** triads, smooth inversions, Nashville numbers, 1–5–6m–4 in G with a pulse pattern, worship backing band.
  - **Conservatory Line, Minuet Station:** G major scale with thumb-under; Minuet in G (Petzold) in 3/4 with key signature, right hand / left hand / hands together, two phrases.
  - **Blue Note Line, Shell Station:** 7th chords, ii–V–I shell voicings, Charleston comping, 12-bar blues jam with a swing band.
- Virtual-partner duets: pick your part, the app plays the other one.
- Family duet: two phones, a 6-character code, a loud count-in that the partner phone hears and syncs to, and 2-character result codes combined into a duet score.
- Chord checks: inspections can now judge chords (microphone spectrum) as well as single notes.
- Web MIDI: Mady's PSR-E383 on the MacBook in Chrome/Edge (Settings → Keyboard). Inspections use the keyboard instead of the mic, and play-along tries are checked automatically.
- Notation: bass clef, grand staff, key signatures, chord symbols, 3/4 time.
- Sessions follow your main line and add a taste of one other chosen line.
- New drills: build-the-chord, Nashville number drill, major/minor ear training.

## 0.1.2 — 2026-11-25 (playtest fixes)
- Backing tracks are louder, with a volume slider (in backing blocks and Settings → Sound).
- Tempo slider on every piece (40–140%). The tempo ladder now suggests rather than dictates.
- "Test out": take any station's ticket inspection right away; passing skips the station.
- Adaptive pace: players who get most things clean on the first try skip mini-lessons, get more new material, and start pieces at 80%.
- Retake placement (Settings).
- Main line choice (onboarding and Settings).
- Data schema v2 (adds main line and backing volume; existing progress is kept).

## 0.1.1 — 2026-11-25
- Fix: the Next button on rhythm drills was invisible after a try.
- Fix: hidden buttons could show before they were needed.

## 0.1.0 — 2026-11-25 (Phase 2, delivery 1)
- First playable build: profiles, onboarding and placement, the Foundations Local (3 stations).
- Practice-session engine with spaced and interleaved review and a tempo ladder.
- Objective touch drills: key finding, note reading, rhythm tapping, ear training.
- Mic ticket inspections with one-time calibration and piano-tuning compensation.
- Durable storage (IndexedDB + mirror), backup codes and files, safe restore, schema migrations.
- Offline PWA, 4 carriage themes.
- Data schema: v1.
