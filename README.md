# Zone Mapper Lovelace Card

A custom Lovelace card for Home Assistant that lets you draw 2D detection zones over a grid and visualize tracked targets (for example, mmWave sensor targets). The card sends zone updates to the Zone Mapper backend integration, which persists the coordinates and exposes occupancy (presence) per zone. Creates boolean presence detection entities for use in automations and scripts.

## Features

- Draw, update, and clear zones of multiple shapes: rectangle, ellipse, polygon
- Polygon zone drawing (double-click canvas to finish, Backspace to undo last vertex, Esc to cancel)
- Polygon capped at 32 vertices (auto-finishes at limit)
- No hard limit to number of zones or tracked target coordinate pairs
- Persist zones (shape + data) via backend coordinate sensors
- Occupancy binary_sensors per zone using tracked x/y entities
- Color-coded zones and target dots
- Mobile-friendly drawing (mouse + touch supported)
- Configurable grid ranges (default X: -5000..5000 mm, Y: 0..10000 mm)
- Helper overlay (device “view cone”) showing a configurable horizontal FOV (default 120° total, i.e., ±60°) to aid placement

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

The Zone Mapper integration registers the service `zone_mapper.update_zone` and creates entities:

- Coordinate sensor: `sensor.zone_mapper_<slug(location)>_zone_<id>` which include: `shape`, `data` (where `data` is shape-specific or null if cleared)
- Presence binary sensor: `<location> Zone <id> Presence` (device class: Occupancy)

Rectangle data schema: `{ x_min, x_max, y_min, y_max }`

Ellipse data schema: `{ cx, cy, rx, ry, rotation_deg? }` (rotation currently not editable via UI but supported backend-side)

Polygon data schema: `{ points: [ { x, y }, ... ] }`

The card uses these attributes to restore zones and reflect occupancy state. A cleared zone is represented by `data: null`.

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

# Optional: override grid ranges (mm)
grid:
  x_min: -5000
  x_max: 5000
  y_min: 0
  y_max: 10000
cone:
  y_max: 6000     # max range (radius) to display, in mm
  fov_deg: 120    # total horizontal FOV in degrees (e.g., 120 => ±60°)
  angle_deg: 0    # initial rotation (-180..180)
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

## Notes:
- After placing an instance of the card with a new device, zone rectangle must be drawn before zone state entities are created and can be added to dashboards
- Coordinates are rounded to the nearest whole mm value for clarity
- The `location` value is slugified (lowercase, spaces → underscores) to locate coordinate sensors: `sensor.zone_mapper_<slug(location)>_zone_<id>`.
- Example: `location: "Office"` → `sensor.zone_mapper_office_zone_1`.

## Using the card

1. Select a zone via its button.
2. Choose a drawing mode (Rect / Ellipse / Poly).
3. For Rect & Ellipse: click/touch and drag to define the bounding box; release to save.
4. For Polygon: click to place vertices; double-click (or double-tap) to finish. Backspace removes the last vertex; Esc cancels the in-progress polygon.
  - Max 32 points; reaching the limit auto-finishes the polygon.
5. Double-click a zone button to clear just that zone (sends `data: null`).
6. Use “Clear All Zones” to clear every configured zone.
7. Target dots are drawn in different colors using the current X/Y sensor values.
8. Rotate the helper “device cone” with the slider (-180..180). Set initial `cone.angle_deg` and `cone.fov_deg` in YAML; cone displays ±(fov_deg/2). Adjust `cone.y_max` for displayed range.

## Mobile and touch support

- The canvas supports touch gestures (press, drag, lift) to draw zones.
- The card disables native touch scrolling on the canvas so you can draw without the page moving.
- If you can tap buttons but can’t draw, ensure you start the drag inside the canvas and lift to finish; also check whether another view/container intercepts gestures.

## Service contract

All zone updates use a unified shape/data model:

```
service: zone_mapper.update_zone
data:
  location: string
  zone_id: number
  shape: 'rect' | 'ellipse' | 'polygon'
  data: null | object       # null clears the zone
  entities:
    - { x: <entity_id>, y: <entity_id> }
    - ...
```

Shape-specific data formats:

Rect:
```
data: { x_min: number, x_max: number, y_min: number, y_max: number }
```
Ellipse:
```
data: { cx: number, cy: number, rx: number, ry: number, rotation_deg?: number }
```
Polygon:
```
data: { points: [ { x: number, y: number }, ... ] }
```

## Troubleshooting

- “Resource not found”:
  - Confirm the resource URL is `/local/zone-mapper-card.js` and the file is under `/config/www`.
  - Clear your browser cache.
- Zones don’t persist:
  - Check coordinate sensor attributes: they should have `shape` and `data`.
  - Ensure the `zone_mapper.update_zone` service exists and is called. (Developer Tools -> Logs/States)
- Coordinate Entity not found:
  - Occures sometimes after update. Redraw zone.
  
- Presence sensors never turn on:
  - Verify tracked X/Y entity states are numeric (not `unknown`/`unavailable`).
  - Confirm the point lies within the drawn zone (correct shape & coordinates).

## Development

- The card is a vanilla JS Web Component; no build step is required.
- Edit `zone-mapper-card.js` and hard refresh your dashboard.
- The backend is a standard Home Assistant custom component (binary_sensor + sensor platforms, custom services).

## License
