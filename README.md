# CAD Drawer

Offline-first site layout, sheet-metal sketch, photo markup and 3D visualisation tool.

This repository replaces the retired RESET 3PM app. The app is designed for direct GitHub → Cloudflare deployment with no Apper dependency.

## What it does

- **Draw sheet-metal pieces** (blanks, round blanks, transitions, point-to-point) with a live cut list and sheet area.
- **HVAC takeoff:** draw *Flex duct runs* (Ø150–500) and place *HVAC symbols* (supply/return grilles, indoor/outdoor units, zone motors, controllers, spigots). The takeoff panel totals metres of flex per size (+10%) and counts each symbol.
- **Measure lines** show their true length; **Calibrate from a line** sets the scale from something of known size in a photo (e.g. a door width).
- **Photo → 3D room:** upload a site photo, tap *Trace room corners*, drag the 4 orange handles to the far wall's corners and the 4 blue handles to the near corners, enter the room size, then *Open photo 3D*. The room is rebuilt in 3D from the photo; flex runs and symbols drawn on the photo appear on the matching wall, ceiling or floor. Drag to turn, pinch to zoom, *Save image*.
- **Outputs:** Print / PDF job sheet (drawing + takeoff + cut list), cut list + takeoff CSV, mock-up PNG, job JSON.
- **WorkBrain:** opened from a WorkBrain job (`?wbJobId=…`), drawings, photo and corners are saved against that job on this device.
- Works offline once loaded; data stays on the device.
