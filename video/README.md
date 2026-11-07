# Groundtruth hackathon videos

Pipeline: beats JSON (script) → voiceover (ElevenLabs, or `say` fallback) → Playwright capture (CDP screencast, crisp
1920×1080 from a 1280×720 viewport at 1.5×) → captions/cards as PNG → ffmpeg assembly with length/size asserts.

```bash
cd video && npm install                      # once (Playwright 1.55, uses cached Chromium)
brew install ffmpeg                          # once

# per deck (pitch | demo); target live = real listings + extension, demo = Vercel /demo fallback
node voiceover.ts pitch                      # VO per beat, prints runtime vs budget
node cards.ts pitch                          # captions, title/end cards, accuracy/limits slides
node capture.ts pitch --target live          # or --target demo ; --only <beatId> to redo one beat
bash assemble.sh pitch                       # -> ../pitch.mp4 (asserts <= 45 s, < 95 MB)

node voiceover.ts demo && node cards.ts demo && node capture.ts demo --target live && bash assemble.sh demo   # -> ../demo.mp4 (<= 180 s)

node build-scripts.ts                        # regenerate scripts/*-script.md from the beats JSON
```

Edit words in `scripts/<deck>.beats.json`, numbers in `scripts/numbers.json`, shots in `shots/<deck>.<target>.json`.
You can mix targets: capture all beats with `--target demo`, then redo single beats live with `--only`.
See `NEEDS.md` for open items (listing URLs, 3D/briefing hooks, ElevenLabs key, proxy origin).
