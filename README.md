# Pulse Drive (HTML5 + Three.js)

Arcade racer prototype targeting desktop & mobile browsers. **Style C:** clean low‑poly, bold shapes, readable HUD.

## Features
- Single‑page app with Three.js (WebGL2), modular code bundled into `dist/main.js`.
- Controllers: Keyboard, Gamepad API (Xbox/PS), and a mobile touch HUD.
- Audio manager with two `<audio>` tags and **1.5s crossfade** between menu and race tracks.
- 3 deterministic tracks (A/B/C). Tracks are baked and cached to `localStorage` (`pd_track_*`).
- 5 cars with subtle spec differences (top/accel/grip). Color swatches retint the car.
- 4 AI bots following a pre‑baked racing line with a curvature-based speed model.
- HUD: speedometer bottom‑center, lap/position/time, minimap, pause/music mini‑bar.
- Results screen with per‑lap times and best‑lap persistence per track.
