# CAD Drawer browser tests

Serve the repo root (e.g. `python3 -m http.server 8781`), install Playwright once
(`npm i --no-save playwright && npx playwright install chromium`), then:

    node tests/cadtest.mjs       # touch drawing, pinch zoom, persistence, WorkBrain job context
    node tests/takeofftest.mjs   # flex runs, HVAC symbols, calibration, CSV, print sheet, mock-up PNG
    node tests/p3dtest.mjs       # photo → 3D room: surface mapping, corner dragging, render, persistence
- `fittingtest.mjs` — room planner (measured objects), transition builder + flat pattern, 3D sketch.
