# Zone Mapper Lovelace Card

A custom Lovelace card for Home Assistant that lets you draw 2D detection zones over a grid and visualize tracked targets (for example, mmWave sensor targets). The card talks to the Zone Mapper backend integration, which persists the zones and exposes per‑zone occupancy sensors you can use in automations.

## Features

- Draw, update, and clear zones of multiple shapes: rectangle, ellipse, polygon
- Polygon drawing tools: double‑click to finish, Backspace to undo last vertex, Esc to cancel
- Polygon capped at 32 vertices (auto‑finishes at limit)
- Zones and rotation persist across Home Assistant restarts (restored from sensor attributes)
- Presence binary_sensors per zone using tracked X/Y entities
- Color‑coded zones and target dots; targets are rotated by the device angle for a consistent view
- Mobile‑friendly drawing (mouse + touch supported)
- Configurable grid ranges (default X: −5000..5000 mm, Y: 0..10000 mm; Y increases downward)
- Helper overlay (device “view cone”) with configurable horizontal FOV and rotation angle
- Compact UI:
  - Bottom‑left: a single ✎ “Draw” button toggles a vertical menu of modes (▭ Rect, ◯ Ellipse, ⬠ Polygon) that appears above it
  - Bottom‑right: 🔒 Lock toggle prevents accidental edits (disables drawing and cancels in‑progress)
  - Device and Entity pickers: choose a HA device and select X/Y sensor entity pairs directly from dropdowns; click Apply to persist

## Requirements

- Home Assistant 2023.4+ recommended
- Zone Mapper backend custom component installed under `custom_components/zone_mapper`
- Sensor entities providing numeric X and Y coordinates for one or more targets

## Installation

1) Copy the card file to your `www` folder:
- `/config/www/zone-mapper-card.js`

2) Add the resource in Settings → Dashboards → Resources:
- URL: `/local/zone-mapper-card.js`
- Type: `JavaScript Module`

3) Refresh your browser cache (Shift + Reload).

## Backend integration

The Zone Mapper integration exposes a single service and creates two entity types per zone:

- Coordinate sensor: `sensor.zone_mapper_<slug(location)>_zone_<id>`
  - Attributes: `shape`, `data`, `entities`, and `rotation_deg`
  - The card reads these to restore zones and rotation on load
- Presence binary sensor: `<location> Zone <id> Presence` (device class: Occupancy)

Shape data formats:

- Rect: `{ x_min, x_max, y_min, y_max }`
- Ellipse: `{ cx, cy, rx, ry }`
- Polygon: `{ points: [ { x, y }, ... ] }`

To clear a zone, send `data: null` (or `shape: none`).

## Card configuration

When adding the card via the UI, the editor pre-fills a starter config. You can edit it inline. Example (generator-based, default):

```yaml
type: custom:zone-mapper-card
dark_mode: false  # optional: true for dark theme styling
location: Office  # friendly name shown on card; used to build zone entity ids

# Default: generator mode (simpler). These build entity ids like
# sensor.<device>_<id>_<sensor>_target_<n>_{x|y}
device: apollo_r_pro_1_w
id: 351af0
sensor: ld2450
target_count: 3

# add or remove zones as needed
zones:
  - id: 1
    name: Zone 1
  - id: 2
    name: Zone 2
  - id: 3
    name: Zone 3

# Optional: override grid ranges (mm). Grid is Y‑down: y_min is top, y_max is bottom
grid:
  x_min: -5000
  x_max: 5000
  y_min: 0
  y_max: 10000
cone:
  y_max: 6000     # max range (radius) to display, in mm
  fov_deg: 120    # total horizontal FOV in degrees (e.g., 120 => ±60°)
  angle_deg: 0    # initial rotation (-180..180); persisted and used for presence math
```

Advanced (direct entity):

```yaml
type: custom:zone-mapper-card
dark_mode: true
location: Kitchen
direct_entity: true
zones:
  - id: 1
    name: Zone 1
  - id: 2
    name: Zone 2
  - id: 3
    name: Zone 3
entities:
  - x1: sensor.apollo_r_pro_1_w_351af0_ld2450_target_1_x
  - y1: sensor.apollo_r_pro_1_w_351af0_ld2450_target_1_y
  - x2: sensor.apollo_r_pro_1_w_351af0_ld2450_target_2_x
  - y2: sensor.apollo_r_pro_1_w_351af0_ld2450_target_2_y
  - x3: sensor.apollo_r_pro_1_w_351af0_ld2450_target_3_x
  - y3: sensor.apollo_r_pro_1_w_351af0_ld2450_target_3_y
```

## Example Automation
```
alias: Zone 1 Trigger
description: ""
triggers:
  - trigger: state
    entity_id:
      - binary_sensor.office_r_pro_zone_1_presence
conditions: []
actions:
  - choose:
      - conditions:
          - condition: state
            entity_id: binary_sensor.office_r_pro_zone_1_presence
            state: "on"
        sequence:
          - type: turn_on
            device_id: f773d95a8b25204ef6ce250f5625cce5
            entity_id: 7720ffeda30bf1ab7d7d4cde296b9e70
            domain: light
      - conditions:
          - condition: state
            entity_id: binary_sensor.office_r_pro_zone_1_presence
            state: "off"
        sequence:
          - type: turn_off
            device_id: f773d95a8b25204ef6ce250f5625cce5
            entity_id: 7720ffeda30bf1ab7d7d4cde296b9e70
            domain: light
mode: single
```

## Notes
- Entities are created on first update for a location; draw a zone once to initialize aiofsd 
- Coordinates are rounded to the nearest millimeter by the backend
- The `location` is slugified (lowercase, spaces → underscores) to locate coordinate sensors: `sensor.zone_mapper_<slug(location)>_zone_<id>`
- Example: `location: "Office"` → `sensor.zone_mapper_office_zone_1`

## Using the card

1. Select a zone via its button.
2. Click ✎ to reveal modes; choose ▭ Rect / ◯ Ellipse / ⬠ Poly.
3. For Rect & Ellipse: click/touch and drag to define the bounding box; release to save.
4. For Polygon: click to place vertices; double-click (or double-tap) to finish. Backspace removes the last vertex; Esc cancels the in-progress polygon.
  - Max 32 points; reaching the limit auto-finishes the polygon.
5. Double-click a zone button to clear just that zone (sends `data: null`).
6. Use “Clear All Zones” to clear every configured zone.
7. Toggle 🔒 to lock/unlock drawing.
8. Target dots are drawn in different colors using the current X/Y sensor values and are rotated by the current angle.
9. Rotate the helper “device cone” with the slider (−180..180). This also updates backend `rotation_deg` and persists across restarts. The cone displays ±(fov_deg/2). Adjust `cone.y_max` for displayed range.

Entity selection in the card:

- Use the Device dropdown to filter entities by a specific HA device.
- Add one or more X/Y pairs via “Add X/Y Pair”. Each row offers two dropdowns listing sensor entities on that device.
- A colored dot next to each select indicates whether the current state is a valid number (green) or not (red).
- Click Apply to save the selected entity pairs to the backend without changing any zone shapes. These persist on the coordinate sensor attributes and restore on reload.

## Mobile and touch support

- The canvas supports touch gestures (press, drag, lift) to draw zones.
- The card disables native touch scrolling on the canvas so you can draw without the page moving.
- If you can tap buttons but can’t draw, ensure you start the drag inside the canvas and lift to finish; also check whether another view/container intercepts gestures.

## Service contract

Single service: `zone_mapper.update_zone`.

Payload fields:

- location: string (required)
- zone_id: number (optional for zone updates; omit for angle‑only update)
- shape: 'none' | 'rect' | 'ellipse' | 'polygon' (optional; 'none' clears)
- data: object | null (optional; null clears the zone)
- rotation_deg: number (optional; −180..180; updates location angle when provided)
- entities: list of `{ x, y }` entity id pairs (optional; replaces tracked entities for presence)

Examples:

Clear a zone:
```
service: zone_mapper.update_zone
data:
  location: Office
  zone_id: 1
  shape: none
  data: null
```

Update only rotation (no zone change):
```
service: zone_mapper.update_zone
data:
  location: Office
  rotation_deg: -15
```

Update a rectangle and tracked entities:
```
service: zone_mapper.update_zone
data:
  location: Office
  zone_id: 2
  shape: rect
  data: { x_min: -500, x_max: 500, y_min: 500, y_max: 1500 }
  entities:
    - { x: sensor.device_target_1_x, y: sensor.device_target_1_y }
    - { x: sensor.device_target_2_x, y: sensor.device_target_2_y }
```

## Troubleshooting

- “Resource not found”:
  - Confirm the resource URL is `/local/zone-mapper-card.js` and the file is under `/config/www`.
  - Clear your browser cache.
- Zones don’t persist:
  - Check the coordinate sensor attributes for `shape`, `data`, and `rotation_deg`
  - Ensure `zone_mapper.update_zone` is being called (Developer Tools → States/Logs)
- Coordinate entity not found:
  - Draw a zone once to initialize entities for the location
- Presence sensors never turn on:
  - Verify tracked X/Y entity states are numeric (not `unknown`/`unavailable`).
  - Confirm the point lies within the drawn zone (correct shape & coordinates).
- Targets dots are staying on card/triggering automations even though I have left the view:
  - This is currently an issue with many ld2450 mmWave sensors using espHome, not related to Zone Mapper

## Development

- The card is a vanilla JS Web Component; no build step is required.
- Edit `zone-mapper-card.js` and hard refresh your dashboard.
- The backend is a standard Home Assistant custom component (binary_sensor + sensor platforms, custom services).

## License
