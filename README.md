# Zone Mapper Lovelace Card

A custom Lovelace card for Home Assistant that lets you draw 2D detection zones over a grid and visualize tracked targets (for example, mmWave sensor targets). The card sends zone updates to the Zone Mapper backend integration, which persists the coordinates and exposes occupancy (presence) per zone. Creates boolean presence detection entities for use in automations and scripts.

## Features

- Draw, update, and clear rectangular detection zones on a grid
- No limit to number of zones or tracked target coordinates
- Persist zone coordinates via backend “coordinate” sensors (no extra storage)
- Occupancy binary_sensors per zone using tracked x/y entities
- Color-coded zones and target dots
- Mobile-friendly drawing (mouse + touch supported)
- Configurable grid ranges (default X: -5000..5000 mm, Y: 0..10000 mm)
- Helper overlay (device “view cone”) to aid placement

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

The Zone Mapper integration registers the service `zone_mapper.update_zone` and creates entities like:

- Coordinate sensor: `sensor.zone_mapper_<device>_zone_<id>_coords` (attributes: `x_min`, `x_max`, `y_min`, `y_max`)
- Presence binary sensor: `<device> Zone <id> Presence` (device class: Occupancy)

The card uses these to restore zones and to reflect occupancy.

## Card configuration

When adding the card via the UI, the editor pre-fills a starter config. You can edit it inline. Example:

```yaml
type: custom:zone-mapper-card
device: office   # name of device/area; used in entity IDs
zones:           # add or remove zones as needed
  - id: 1
    name: Zone 1
  - id: 2
    name: Zone 2
  - id: 3
    name: Zone 3
entities:        # tracked target entities (pairs of x/y)
  - x1: sensor.device_target_1_x
  - y1: sensor.device_target_1_y
  - x2: sensor.device_target_2_x
  - y2: sensor.device_target_2_y
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
- The `device` value is slugified (lowercase, spaces → underscores) to locate coordinate sensors: `sensor.zone_mapper_<slug(device)>_zone_<id>_coords`.
- Example: `device: "Office"` → `sensor.zone_mapper_office_zone_1_coords`.

## Using the card

- Select a zone via its button, then click/touch and drag on the grid to draw the rectangle.
- Release to save. The card calls `zone_mapper.update_zone`; the backend stores the coordinates.
- Use “Clear All Zones” to reset all zones (also updates backend to zeros for each configured zone).
- Target dots are drawn in different colors using the current X/Y sensor values.

## Mobile and touch support

- The canvas supports touch gestures (press, drag, lift) to draw zones.
- The card disables native touch scrolling on the canvas so you can draw without the page moving.
- If you can tap buttons but can’t draw, ensure you start the drag inside the canvas and lift to finish; also check whether another view/container intercepts gestures.

## Service contract

The card calls the backend with:

```
service: zone_mapper.update_zone
data:
  device: string
  zone_id: number
  x_min: number
  x_max: number
  y_min: number
  y_max: number
  entities:
    - { x: <entity_id>, y: <entity_id> }
    - ...
```

## Troubleshooting

- “Resource not found”:
  - Confirm the resource URL is `/local/zone-mapper-card.js` and the file is under `/config/www`.
  - Clear your browser cache.
- Zones don’t persist:
  - Check the coordinate sensors for attributes: `sensor.zone_mapper_<device>_zone_<id>_coords`.
  - Ensure the `zone_mapper.update_zone` service exists and is called (Developer Tools → Logs/States).
- Coordinate Entity not found:
  - Redraw zone rectangle
- Presence sensors never turn on:
  - Verify your tracked X/Y entity states are numeric (not `unknown`/`unavailable`).
  - Confirm your rectangle bounds cover the expected X/Y range.

## Development

- The card is a vanilla JS Web Component; no build step is required.
- Edit `zone-mapper-card.js` and hard refresh your dashboard.
- The backend is a standard Home Assistant custom component (binary_sensor + sensor platforms, custom services).

## License
