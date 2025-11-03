const COLOR = Object.freeze({
  ui: {
    lightCanvasBackground: '#ffffff',
    darkContainerBackground: '#1e1f23',
    darkContainerText: '#eceff4',
    darkCanvasBorder: '#3a3d45',
    darkCanvasBackground: '#121316',
    overlayButtonLightBg: 'rgba(0, 0, 0, 0.50)',
    overlayButtonLightBorder: 'rgba(255, 255, 255, 0.25)',
    overlayButtonDarkBg: 'rgba(255, 255, 255, 0.16)',
    overlayButtonDarkBorder: 'rgba(255, 255, 255, 0.25)',
    overlayButtonText: '#ffffff',
    overlayButtonActiveOutline: '#4caf50',
    darkPrimaryButton: '#2d7dd2',
    darkZoneButtonBg: '#2a2c31',
    darkZoneButtonText: '#e5e9f0',
    darkZoneButtonBorder: '#3a3d45',
    darkZoneButtonActiveBg: '#2d7dd2',
    darkZoneButtonActiveBorder: '#2d7dd2',
    infoDarkText: '#b0b6c2',
    zoneItemDarkBg: '#2a2c31',
    zoneItemDarkText: '#d8dee9',
    darkSelectBg: '#202226',
    darkSelectBorder: '#3a3d45',
    darkSelectText: '#e5e9f0',
    primaryButtonText: '#ffffff',
  },
  canvas: {
    defaultTarget: '#ff6b6b',
    targetStroke: '#ffffff',
    gridLine: '#e0e0e0',
    axisLight: '#000000',
    axisDark: '#ffffff',
    polygonPreviewLight: 'rgba(100,100,100,0.75)',
    polygonPreviewDark: 'rgba(255,255,255,0.75)',
    polygonVertexFillLight: '#000000',
    polygonVertexFillDark: '#ffffff',
    polygonVertexStrokeLight: 'rgba(255,255,255,0.6)',
    polygonVertexStrokeDark: 'rgba(0,0,0,0.6)',
    polygonStrokeLight: 'rgba(33,33,33,0.85)',
    polygonStrokeDark: 'rgba(255,255,255,0.85)',
    drawStrokeLight: 'rgba(100, 100, 100, 0.5)',
    drawStrokeDark: 'rgba(255,255,255,0.75)',
    deviceConeFill: 'rgba(128, 233, 31, 0.06)',
    deviceConeStroke: 'rgba(117, 243, 33, 0.6)',
    zonePalette: [
      'rgba(244, 67, 54, 0.30)',
      'rgba(33, 150, 243, 0.30)',
      'rgba(76, 175, 80, 0.30)',
      'rgba(255, 193, 7, 0.30)',
      'rgba(156, 39, 176, 0.30)',
    ],
    targetPalette: ['#f44336', '#2196f3', '#4caf50', '#ffc107', '#9c27b0'],
  },
});

const DRAW_MODES = Object.freeze({
  RECT: 'rect',
  ELLIPSE: 'ellipse',
  POLYGON: 'polygon',
});

const DEFAULT_GRID = Object.freeze({
  xMin: -5000,
  xMax: 5000,
  yMin: 0,
  yMax: 10000,
});

const DEFAULT_CONE = Object.freeze({
  yMax: 6000,
  fovDeg: 120,
  angleDeg: 0,
});

const POLYGON_MAX_POINTS = 32;

const LENGTH_UNITS = Object.freeze({
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  ft: 304.8,
});

const GRID_STEP_CANDIDATES = Object.freeze({
  in: Object.freeze([1, 2, 3, 6, 12, 24, 36, 48, 60, 72, 96, 120]),
  ft: Object.freeze([0.25, 0.5, 1, 2, 5, 10, 20, 50, 100]),
  default: Object.freeze([0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100]),
});

const UNIT_ALIASES = Object.freeze({
  mm: 'mm',
  millimeter: 'mm',
  millimeters: 'mm',
  millimetre: 'mm',
  millimetres: 'mm',
  cm: 'cm',
  centimeter: 'cm',
  centimeters: 'cm',
  centimetre: 'cm',
  centimetres: 'cm',
  m: 'm',
  meter: 'm',
  meters: 'm',
  metre: 'm',
  metres: 'm',
  in: 'in',
  inch: 'in',
  inches: 'in',
  ft: 'ft',
  foot: 'ft',
  feet: 'ft',
});

function slugifyLocation(value) {
  if (!value) return '';
  let text = String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  text = text.replace(/[^a-z0-9]+/g, '_');
  text = text.replace(/^_+|_+$/g, '');
  text = text.replace(/_{2,}/g, '_');
  return text || 'unknown';
}

class ZoneMapperCard extends HTMLElement {
  static get GRID_MIN_SPACING_PX() {
    return 40;
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    // Defaults
    this.darkMode = false;
    this.isDrawing = false;
    this.startPoint = null;
    this._cursorPoint = null;
    this._activeInput = null;
    this.trackedEntities = [];
    this._selectedDeviceId = null;
    this.showZones = false;
    this.showConfig = false;
    this.showDeviceTargets = false;
    this._polyPoints = [];
    this.zones = [];
    this.zoneConfig = [];
    this.selectedZone = null;
    // Grid defaults (mm)
    this.xMin = DEFAULT_GRID.xMin;
    this.xMax = DEFAULT_GRID.xMax;
    this.yMin = DEFAULT_GRID.yMin;
    this.yMax = DEFAULT_GRID.yMax;
    // Cone defaults
    this.coneYMax = DEFAULT_CONE.yMax;
    this.coneFovDeg = DEFAULT_CONE.fovDeg;
    this.coneAngleDeg = DEFAULT_CONE.angleDeg;
    this.coneAngleDefault = DEFAULT_CONE.angleDeg;
    // Drawing/UI
    this.polyMaxPoints = POLYGON_MAX_POINTS;
    this.drawMode = DRAW_MODES.RECT;
    this.showModeMenu = false;
    this.isLocked = false;
    this._lastLockWarningTs = 0;
    this.inputUnits = 'mm';
    this.gridUnits = 'mm';
    this.inputUnitMultiplier = LENGTH_UNITS.mm;
    this.gridUnitMultiplier = LENGTH_UNITS.mm;
    this.unitDisplay = false;
    this.unitLabelSize = 18; // px
    this._gridCache = null;
    this._coneRingsCache = null;
  }

  // Default stub config
  static getStubConfig() {
    return {
      type: 'custom:zone-mapper-card',
      dark_mode: false,
      unit_display: false,
      // unit_label_size: 18,
      // optional, px label size override
      input_units: 'mm',
      grid_units: 'mm',
      location: 'Office',
      // Units support: 'mm', 'cm', 'm', 'in', 'ft' converts to millimeters internally
      // By default, use the in-card dropdowns to select a device and X/Y entities.
      // Zones can be managed in-card; you can optionally pre-seed a list here:
      // zones: [ { id: 1, name: 'Zone 1' } ],
      grid: {
        x_min: -6000,
        x_max: 6000,
        y_min: 0,
        y_max: 12000,
      },
      // Grid is y-down oriented, so y_min is top, y_max is bottom
      cone: {
        y_max: 6000,
        fov_deg: 120,
        angle_deg: 0,
      },
    };
  }

  setConfig(config) {
    // Require `location` for naming/UI and backend key
    if (!config.location) {
      throw new Error('You must specify a location.');
    }

    this.config = config;
    // Resolve location name used for UI, entity restoration, and backend
    this.location = String(config.location);

    this.inputUnits = this._normalizeUnit(config.input_units);
    this.gridUnits = this._normalizeUnit(config.grid_units);
    this.inputUnitMultiplier = this._unitMultiplier(this.inputUnits);
    this.gridUnitMultiplier = this._unitMultiplier(this.gridUnits);
    this.unitDisplay = !!config.unit_display;
    if (config.unit_label_size !== undefined) {
      const s = Number(config.unit_label_size);
      if (Number.isFinite(s)) {
        // clamp between 8 and 24 px for sanity
        this.unitLabelSize = Math.max(8, Math.min(24, Math.round(s)));
      }
    }

    this.zoneConfig = Array.isArray(config.zones) ? [...config.zones] : [];
    this.trackedEntities = this.buildTrackedEntities(config);

    if (config.dark_mode !== undefined) {
      this.darkMode = !!config.dark_mode;
    }

    this._applyGridConfig(config.grid);
    this._applyConeConfig(config.cone);

    this._invalidateGridCache();
    this._invalidateConeCache();
    this.render();
  }

  set hass(hass) {
    const firstTime = !this._hass;
    this._hass = hass;
    if (firstTime && this.canvas) {
      this.updateZonesFromEntities();
    }
    if (this.canvas) {
      this.drawGrid();
    }
    if (firstTime && this._hass) {
      // Load device/entity registries once on first hass injection
      this._ensureRegistriesLoaded();
    }
  }

  processEntityConfig(entityConfig) {
    if (!entityConfig || !Array.isArray(entityConfig)) {
      return [];
    }
    const entityPairs = {};
    entityConfig.forEach((item) => {
      const key = Object.keys(item)[0];
      const value = item[key];
      const match = key.match(/([xy])(\d+)/);
      if (match) {
        const axis = match[1];
        const index = match[2];
        if (!entityPairs[index]) entityPairs[index] = {};
        entityPairs[index][axis] = value;
      }
    });
    return Object.values(entityPairs).filter((pair) => pair.x && pair.y);
  }

  buildTrackedEntities(cfg) {
    if (cfg && cfg.direct_entity) {
      return this.processEntityConfig(cfg.entities);
    }
    // Default: no preconfigured pairs; user selects via dropdowns
    return [];
  }

  _template() {
    const gridUnitLabel = this._unitLabel(this.gridUnits);
    const inputUnitLabel = this._unitLabel(this.inputUnits);
    const displayXMin = this._formatGridValue(this.xMin);
    const displayXMax = this._formatGridValue(this.xMax);
    const displayYMin = this._formatGridValue(this.yMin);
    const displayYMax = this._formatGridValue(this.yMax);
    const displayConeRange = this._formatGridValue(this.coneYMax);
    return `
      <style>
        :host { display: block; padding: 16px; }
        /* Theme tokens */
        :host {
          --zm-gap: 8px;
          --zm-radius: 10px;
          --zm-chip-bg: var(--secondary-background-color);
          --zm-chip-active: var(--primary-color);
          --zm-chip-color: var(--primary-text-color);
        }
        .container { background: var(--card-background-color); border-radius: var(--ha-card-border-radius, 12px); box-shadow: var(--ha-card-box-shadow); padding: 16px; }
        .container.dark { background: ${COLOR.ui.darkContainerBackground}; color: ${COLOR.ui.darkContainerText}; }
        .container.dark .canvas-container { border-color: ${COLOR.ui.darkCanvasBorder}; background: ${COLOR.ui.darkCanvasBackground}; }
        .canvas-container { position: relative; width: 100%; aspect-ratio: 1; border: 1px solid var(--divider-color); border-radius: var(--zm-radius); overflow: hidden; background: ${COLOR.ui.lightCanvasBackground}; isolation: isolate; }
        canvas { width: 100%; height: 100%; cursor: crosshair; touch-action: none; }
        .overlay-controls { position: absolute; bottom: 4px; display: flex; gap: 4px; z-index: 1; }
        .overlay-controls-left { left: 4px; flex-direction: column; align-items: flex-start; }
        .overlay-controls-right { right: 4px; }
        .overlay-controls button { background: ${COLOR.ui.overlayButtonLightBg}; color: ${COLOR.ui.overlayButtonText}; border: none; border-radius: 6px; font-size: 11px; line-height: 1; cursor: pointer; backdrop-filter: blur(4px); display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 6px; min-height: 32px; }
        #modeGroup button { font-size: 16px; width: 32px; height: 32px; min-width: 32px; min-height: 32px; padding: 0; }
        #btnModeMenu { font-size: 16px; width: 32px; height: 32px; min-width: 32px; min-height: 32px; padding: 0; }
        .overlay-controls button span { font-size: 13px; line-height: 1; }
        .overlay-controls button.lock-toggle { padding: 6px; }
        .overlay-controls button.lock-toggle .icon { font-size: 1.35em; line-height: 1; }
        .container.dark .overlay-controls button { background: ${COLOR.ui.overlayButtonDarkBg}; color: ${COLOR.ui.overlayButtonText}; border-color: ${COLOR.ui.overlayButtonDarkBorder}; }
        .overlay-controls button.active { outline: 2px solid ${COLOR.ui.overlayButtonActiveOutline}; }
        .overlay-controls button:disabled { opacity: 0.4; cursor: default; }
        .controls { margin: 12px 0; display: flex; gap: var(--zm-gap); flex-wrap: wrap; }
        #cone-controls { align-items: center; padding-top: 8px; }
        #coneAngleSlider { flex: 1; min-width: 160px; }
        button { padding: 8px 16px; background: var(--primary-color); color: ${COLOR.ui.primaryButtonText}; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
        .container.dark button { background: ${COLOR.ui.darkPrimaryButton}; }
        button:hover { opacity: 0.9; }
        button.zone-btn {
          padding: 6px 10px;
          border-radius: 999px;
          background: var(--zm-chip-bg);
          color: var(--zm-chip-color);
          border: 1px solid var(--divider-color);
        }
        button.zone-btn.active {
          background: var(--zm-chip-active);
          color: ${COLOR.ui.overlayButtonText};
          border-color: var(--zm-chip-active);
        }
        .container.dark button.zone-btn {
          background: ${COLOR.ui.darkZoneButtonBg};
          color: ${COLOR.ui.darkZoneButtonText};
          border-color: ${COLOR.ui.darkZoneButtonBorder};
        }
        .container.dark button.zone-btn.active {
          /* Match other buttons' dark color */
          background: ${COLOR.ui.darkZoneButtonActiveBg};
          color: ${COLOR.ui.overlayButtonText};
          border-color: ${COLOR.ui.darkZoneButtonActiveBorder};
        }
        .info { margin-top: 12px; font-size: 14px; color: var(--secondary-text-color); }
        .container.dark .info { color: ${COLOR.ui.infoDarkText}; }
        .container.dark .zone-item { background: ${COLOR.ui.zoneItemDarkBg}; color: ${COLOR.ui.zoneItemDarkText}; }
        .entity-selection { margin: 4px 0; padding: 0; background: transparent; border-radius: 0; }
        .entity-row { display: grid; grid-template-columns: auto 1fr 1fr auto; gap: 6px; align-items: center; margin: 6px 0; }
        .entity-row label { font-weight: 600; opacity: 0.95; }
        .entity-row select { width: 100%; padding: 2px 6px; border: 1px solid var(--divider-color); border-radius: 6px; background: var(--card-background-color); color: var(--primary-text-color); font-size: 12px; height: 28px; }
        .container.dark .entity-row select { background: ${COLOR.ui.darkSelectBg}; border-color: ${COLOR.ui.darkSelectBorder}; color: ${COLOR.ui.darkSelectText}; }
        .device-title { font-size: 1.2em; font-weight: bold; margin-bottom: 8px; }
        .entity-controls { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
        .entity-controls select { width: 100%; }
        .pair-actions { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
        .subtle { opacity: 0.85; font-size: 0.92em; }
        .config { margin-top: 0; }
        .config-header { display: flex; align-items: center; justify-content: space-between; cursor: pointer; padding: 4px 0; background: transparent; border-radius: 0; }
        .config-title { font-weight: 600; }
        .config-content { max-height: 0; overflow: hidden; transition: max-height 200ms ease, padding 200ms ease; padding: 0; }
        .config-content.open { max-height: 1200px; padding: 4px 0; }
        .subsection-header { display: flex; align-items: center; justify-content: space-between; cursor: pointer; padding: 4px 0; background: transparent; border-radius: 0; margin-top: 4px; }
        .subsection-title { font-weight: 600; }
        @media (max-width: 520px) { .entity-row { grid-template-columns: 1fr; } }
      </style>
      <div class="container ${this.darkMode ? 'dark' : ''}">
        <div class="device-title">Location: ${this.location}</div>
        <div class="canvas-container">
          <canvas id="zoneCanvas"></canvas>
          <div class="overlay-controls overlay-controls-left" id="overlayControlsLeft">
            <div id="modeGroup" style="display: ${this.showModeMenu ? 'flex' : 'none'}; flex-direction: column; gap: 4px;">
              <button id="btnPolyFinish" title="Finish polygon">✓</button>
              <button id="btnPolyUndo" title="Undo last point">↺</button>
              <button id="btnModePolygon" title="Polygon">⬠</button>
              <button id="btnModeEllipse" title="Ellipse">◯</button>
              <button id="btnModeRect" title="Rectangle">▭</button>
            </div>
            <button id="btnModeMenu" title="Drawing modes">✎</button>
          </div>
          <div class="overlay-controls overlay-controls-right" id="overlayControlsRight">
            <button id="btnLock" class="lock-toggle" title="Lock drawing">🔓</button>
          </div>
        </div>
        <div class="controls" id="zone-buttons">
        </div>
        <div class="config">
          <div id="btnConfigToggle" class="config-header">
            <span class="config-title">Configure</span>
            <span>${this.showConfig ? '▾' : '▸'}</span>
          </div>
          <div id="configContent" class="config-content ${this.showConfig ? 'open' : ''}">
            <div class="controls" id="cone-controls">
              <label for="coneAngleSlider">Cone rotation: </label>
              <input type="range" id="coneAngleSlider" min="-180" max="180" step="1" value="${this.coneAngleDeg}" />
              <span id="coneAngleLabel">${this.coneAngleDeg}°</span>
            </div>
            <div class="subsection-header" id="toggleDeviceTargets">
              <span class="subsection-title">Device and Targets</span>
              <span id="caretDeviceTargets">${this.showDeviceTargets ? '▾' : '▸'}</span>
            </div>
            <div class="config-content ${this.showDeviceTargets ? 'open' : ''}" id="sectionDeviceTargets">
              <div class="entity-selection">
                <div class="entity-controls">
                  <label for="deviceSelect" class="subtle">Device</label>
                  <select id="deviceSelect"></select>
                  <span class="subtle">Select the HA device that owns your X/Y sensor entities.</span>
                </div>
                <div id="entityPairs"></div>
                <div class="pair-actions">
                  <button id="btnAddPair" title="Add X/Y pair">Add X/Y Pair</button>
                  <button id="btnApplyEntities" title="Save entity pairs to backend">Apply</button>
                </div>
              </div>
            </div>
            <div class="subsection-header" id="toggleZones">
              <span class="subsection-title">Zones</span>
              <span id="caretZones">${this.showZones ? '▾' : '▸'}</span>
            </div>
            <div class="config-content ${this.showZones ? 'open' : ''}" id="sectionZones">
              <div class="entity-selection">
                <div class="entity-controls">
                  <div class="pair-actions">
                    <button id="btnAddZone" title="Add new zone">Add Zone</button>
                  </div>
                  <div id="zoneManager"></div>
                </div>
              </div>
            </div>
            <div class="info">
              Click & drag for Rectangle/Ellipse. Polygon: click points, double-click to finish (max ${this.polyMaxPoints} pts). Grid units: ${gridUnitLabel} (X: ${displayXMin}..${displayXMax}, Y: ${displayYMin}..${displayYMax}). Input units: ${inputUnitLabel}. Cone range: ${displayConeRange} ${gridUnitLabel}
            </div>
          </div>

        </div>
      </div>
    `;
  }

  render() {
    this._detachGlobalListeners();
    this.shadowRoot.innerHTML = this._template();

    this.renderZoneButtons();
    this.setupCanvas();
    this.attachEventListeners();
    this._renderEntitySelection();
    this._renderZoneManager();
    if (this._hass) {
      this.updateZonesFromEntities();
    }
  }

  renderZoneButtons() {
    const container = this.shadowRoot.getElementById('zone-buttons');
    if (!container) return;
    container.innerHTML = '';
    if (!this.zoneConfig || this.zoneConfig.length === 0) {
      this.selectedZone = null;
    }
    this.zoneConfig.forEach((zone) => {
      const btn = document.createElement('button');
      btn.className = 'zone-btn';
      btn.dataset.zoneId = zone.id;
      btn.textContent = this._zoneLabel(zone.id);
      btn.addEventListener('click', () => this._setSelectedZone(zone.id));
      btn.addEventListener('dblclick', (e) => {
        e.preventDefault();
        this._clearZone(zone.id, true);
      });
      container.appendChild(btn);
    });

    const clearBtn = document.createElement('button');
    clearBtn.id = 'clearBtn';
    clearBtn.className = 'zone-btn clear-all';
    clearBtn.textContent = 'Clear All Zones';
    container.appendChild(clearBtn);

    const firstZone = container.querySelector('.zone-btn[data-zone-id]');
    if (this.selectedZone !== null && this.selectedZone !== undefined) {
      const existingSelection = container.querySelector(
        `.zone-btn[data-zone-id="${this.selectedZone}"]`,
      );
      if (existingSelection) {
        this._setSelectedZone(this.selectedZone);
        return;
      }
    }
    if (firstZone) {
      this._setSelectedZone(Number(firstZone.dataset.zoneId));
    }
  }

  drawCurrentPosition(x, y, color = COLOR.canvas.defaultTarget) {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const pixelX = this.valueToPixels(x, 'x');
    const pixelY = this.valueToPixels(y, 'y');

    if (pixelX >= 0 && pixelX <= this.canvas.width && pixelY >= 0 && pixelY <= this.canvas.height) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pixelX, pixelY, 10, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = COLOR.canvas.targetStroke;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  attachEventListeners() {
    this._attachZoneListEvents();
    this._attachCanvasEvents();
    this._attachConeControls();
    this._attachDrawingModeControls();
    this._attachConfigEvents();
  }

  _attachZoneListEvents() {
    const zoneButtons = this.shadowRoot.getElementById('zone-buttons');
    if (!zoneButtons) return;
    zoneButtons.addEventListener('click', (event) => {
      const target = event.target;
      if (!target || target.id !== 'clearBtn') {
        return;
      }
      this._clearAllZones();
    });
  }

  _attachCanvasEvents() {
    if (!this.canvas) return;

    const handleMouseDown = (event) => this.startDrawing(event);
    const handleMouseMove = (event) => this.draw(event);
    const handleMouseUp = (event) => this.endDrawing(event);

    this.canvas.addEventListener('mousedown', handleMouseDown);
    this.canvas.addEventListener('mousemove', handleMouseMove);
    this.canvas.addEventListener('mouseup', handleMouseUp);

    this.canvas.addEventListener(
      'touchstart',
      (event) => {
        event.preventDefault();
        this.startDrawing(event);
      },
      { passive: false },
    );
    this.canvas.addEventListener(
      'touchmove',
      (event) => {
        event.preventDefault();
        this.draw(event);
      },
      { passive: false },
    );
    this.canvas.addEventListener(
      'touchend',
      (event) => {
        event.preventDefault();
        this.endDrawing(event);
      },
      { passive: false },
    );

    this.canvas.addEventListener('dblclick', () => {
      if (this.drawMode === DRAW_MODES.POLYGON) {
        this.finishPolygon();
      }
    });

    this._onKeyDown = (event) => {
      if (this.drawMode !== DRAW_MODES.POLYGON) return;
      if (event.key === 'Escape') {
        this._polyPoints = [];
        this.isDrawing = false;
        this.drawGrid();
      } else if (event.key === 'Backspace' && this._polyPoints.length > 0) {
        this._polyPoints.pop();
        this.drawGrid();
      }
    };
    window.addEventListener('keydown', this._onKeyDown);

    const canvasContainer = this.canvas.parentElement;
    this._outsideClickHandler = (event) => {
      if (!this.canvas) return;
      if (canvasContainer && canvasContainer.contains(event.target)) return;
      if (!this.shadowRoot.contains(event.target)) return;
      if (this.isDrawing) this.cancelDrawing();
    };
    document.addEventListener('mousedown', this._outsideClickHandler, true);
    document.addEventListener('touchstart', this._outsideClickHandler, true);

    if (canvasContainer) {
      canvasContainer.addEventListener('mouseleave', () => {
        if (this.isDrawing) this.cancelDrawing();
      });
    }
  }

  _attachConeControls() {
    const angleSlider = this.shadowRoot.getElementById('coneAngleSlider');
    const angleLabel = this.shadowRoot.getElementById('coneAngleLabel');
    if (!angleSlider || !angleLabel) return;

    const updateDisplay = () => {
      angleLabel.textContent = `${this.coneAngleDeg}°`;
      angleSlider.value = String(this.coneAngleDeg);
    };

    angleSlider.addEventListener('input', () => {
      const value = parseInt(angleSlider.value, 10);
      if (Number.isNaN(value)) return;
      this.coneAngleDeg = this._clampConeAngle(value);
      this._invalidateConeCache();
      updateDisplay();
      this.drawGrid();
    });

    angleSlider.addEventListener('change', () => {
      this._persistRotation();
    });

    angleSlider.addEventListener('dblclick', () => {
      this.coneAngleDeg = this.coneAngleDefault;
      this._invalidateConeCache();
      updateDisplay();
      this.drawGrid();
      this._persistRotation();
    });

    updateDisplay();
  }

  _attachDrawingModeControls() {
    const btnModeMenu = this.shadowRoot.getElementById('btnModeMenu');
    const modeGroup = this.shadowRoot.getElementById('modeGroup');
    const btnModeRect = this.shadowRoot.getElementById('btnModeRect');
    const btnModeEllipse = this.shadowRoot.getElementById('btnModeEllipse');
    const btnModePolygon = this.shadowRoot.getElementById('btnModePolygon');
    const btnPolyUndo = this.shadowRoot.getElementById('btnPolyUndo');
    const btnPolyFinish = this.shadowRoot.getElementById('btnPolyFinish');
    const btnLock = this.shadowRoot.getElementById('btnLock');

    if (btnModeMenu && modeGroup) {
      btnModeMenu.addEventListener('click', () => {
        this.showModeMenu = !this.showModeMenu;
        modeGroup.style.display = this.showModeMenu ? 'flex' : 'none';
      });
    }

    if (btnModeRect)
      btnModeRect.addEventListener('click', () => this._setDrawMode(DRAW_MODES.RECT));
    if (btnModeEllipse)
      btnModeEllipse.addEventListener('click', () => this._setDrawMode(DRAW_MODES.ELLIPSE));
    if (btnModePolygon)
      btnModePolygon.addEventListener('click', () => this._setDrawMode(DRAW_MODES.POLYGON));

    if (btnPolyUndo) {
      btnPolyUndo.addEventListener('click', () => {
        if (this.drawMode === DRAW_MODES.POLYGON && this._polyPoints.length) {
          this._polyPoints.pop();
          this.drawGrid();
        }
      });
    }

    if (btnPolyFinish) {
      btnPolyFinish.addEventListener('click', () => {
        if (this.drawMode === DRAW_MODES.POLYGON) this.finishPolygon();
      });
    }

    if (btnLock) {
      const updateLockVisual = () => {
        btnLock.innerHTML = this.isLocked
          ? '<span>Locked</span><span class="icon">🔒</span>'
          : '<span>Unlocked</span><span class="icon">🔓</span>';
        btnLock.title = this.isLocked ? 'Unlock drawing' : 'Lock drawing';
        if (this.canvas) {
          this.canvas.style.cursor = this.isLocked ? 'not-allowed' : 'crosshair';
        }
      };
      btnLock.addEventListener('click', () => {
        this.isLocked = !this.isLocked;
        updateLockVisual();
        this._lastLockWarningTs = 0;
        if (this.isLocked) {
          if (this.isDrawing) this.cancelDrawing();
          this._notify('Drawing locked. Unlock the grid to edit zones.');
        } else {
          this._notify('Drawing unlocked. You can edit zones now.');
        }
      });
      updateLockVisual();
    }

    this._setDrawMode(this.drawMode || DRAW_MODES.RECT);
  }

  _attachConfigEvents() {
    const btnConfigToggle = this.shadowRoot.getElementById('btnConfigToggle');
    const configContent = this.shadowRoot.getElementById('configContent');
    if (btnConfigToggle && configContent) {
      btnConfigToggle.addEventListener('click', () => {
        this.showConfig = !this.showConfig;
        configContent.classList.toggle('open', this.showConfig);
        const caret = btnConfigToggle.querySelector('span:last-child');
        if (caret) caret.textContent = this.showConfig ? '▾' : '▸';
      });
    }

    const deviceSelect = this.shadowRoot.getElementById('deviceSelect');
    if (deviceSelect) {
      deviceSelect.addEventListener('change', () => {
        this._selectedDeviceId = deviceSelect.value || null;
        if (!this._selectedDeviceId) {
          this.trackedEntities = [];
          this._renderEntitySelection();
          this.drawGrid();
          return;
        }
        this._suggestPairsFromDevice(true);
        this._renderEntitySelection();
      });
    }

    const btnAddPair = this.shadowRoot.getElementById('btnAddPair');
    if (btnAddPair) {
      btnAddPair.addEventListener('click', () => {
        this.trackedEntities = [...(this.trackedEntities || []), { x: '', y: '' }];
        this._renderEntitySelection();
      });
    }

    const btnApplyEntities = this.shadowRoot.getElementById('btnApplyEntities');
    if (btnApplyEntities) {
      btnApplyEntities.addEventListener('click', () => {
        if (!this._hass) return;
        const pairs = (this.trackedEntities || []).filter((pair) => pair.x && pair.y);
        this._hass.callService('zone_mapper', 'update_zone', {
          location: this.location,
          entities: pairs,
        });
        this.drawGrid();
        this._notify('Entity pairs saved');
      });
    }

    const btnAddZone = this.shadowRoot.getElementById('btnAddZone');
    if (btnAddZone) {
      btnAddZone.addEventListener('click', () => this._handleAddZone());
    }

    const toggleDeviceTargets = this.shadowRoot.getElementById('toggleDeviceTargets');
    const caretDeviceTargets = this.shadowRoot.getElementById('caretDeviceTargets');
    const sectionDeviceTargets = this.shadowRoot.getElementById('sectionDeviceTargets');
    if (toggleDeviceTargets && caretDeviceTargets && sectionDeviceTargets) {
      toggleDeviceTargets.addEventListener('click', () => {
        this.showDeviceTargets = !this.showDeviceTargets;
        sectionDeviceTargets.classList.toggle('open', this.showDeviceTargets);
        caretDeviceTargets.textContent = this.showDeviceTargets ? '▾' : '▸';
      });
    }

    const toggleZones = this.shadowRoot.getElementById('toggleZones');
    const caretZones = this.shadowRoot.getElementById('caretZones');
    const sectionZones = this.shadowRoot.getElementById('sectionZones');
    if (toggleZones && caretZones && sectionZones) {
      toggleZones.addEventListener('click', () => {
        this.showZones = !this.showZones;
        sectionZones.classList.toggle('open', this.showZones);
        caretZones.textContent = this.showZones ? '▾' : '▸';
      });
    }
  }

  _applyGridConfig(grid) {
    if (!grid || typeof grid !== 'object') return;
    const convert = (value) => {
      const mmValue = this._convertToMm(value, this.gridUnits);
      return mmValue === null ? null : mmValue;
    };

    const next = {
      xMin: convert(grid.x_min),
      xMax: convert(grid.x_max),
      yMin: convert(grid.y_min),
      yMax: convert(grid.y_max),
    };

    if (next.xMin !== null) this.xMin = next.xMin;
    if (next.xMax !== null) this.xMax = next.xMax;
    if (next.yMin !== null) this.yMin = next.yMin;
    if (next.yMax !== null) this.yMax = next.yMax;

    if (this.xMin > this.xMax) {
      [this.xMin, this.xMax] = [this.xMax, this.xMin];
    }
    if (this.yMin > this.yMax) {
      [this.yMin, this.yMax] = [this.yMax, this.yMin];
    }
    if (this.xMin === this.xMax) {
      this.xMax = this.xMin + 1;
    }
    if (this.yMin === this.yMax) {
      this.yMax = this.yMin + 1;
    }

    this._invalidateGridCache();
    this._invalidateConeCache();
  }

  _applyConeConfig(cone) {
    if (!cone || typeof cone !== 'object') return;
    if (cone.y_max !== undefined) {
      const mmValue = this._convertToMm(cone.y_max, this.gridUnits);
      if (mmValue !== null) {
        this.coneYMax = Math.max(0, mmValue);
      }
    }
    if (cone.fov_deg !== undefined) {
      const fov = Number(cone.fov_deg);
      this.coneFovDeg = Number.isFinite(fov) ? Math.min(360, Math.max(1, fov)) : this.coneFovDeg;
    }
    if (cone.angle_deg !== undefined) {
      const angle = this._clampConeAngle(Number(cone.angle_deg));
      this.coneAngleDefault = angle;
      this.coneAngleDeg = angle;
    }

    this._invalidateConeCache();
  }

  _clampConeAngle(angle) {
    if (Number.isNaN(angle)) return 0;
    return Math.max(-180, Math.min(180, angle));
  }

  _clampValue(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return min;
    if (min > max) return numeric;
    return Math.max(min, Math.min(max, numeric));
  }

  _clampAndRound(value, min, max) {
    return Math.round(this._clampValue(value, min, max));
  }

  _normalizeUnit(unit) {
    if (unit === null || unit === undefined) return 'mm';
    const key = String(unit).trim().toLowerCase();
    if (!key) return 'mm';
    const normalized = UNIT_ALIASES[key] || (LENGTH_UNITS[key] ? key : null);
    return normalized || 'mm';
  }

  _unitMultiplier(unit) {
    return LENGTH_UNITS[unit] || LENGTH_UNITS.mm;
  }

  _unitLabel(unit) {
    return this._normalizeUnit(unit);
  }

  _convertToMm(value, unit) {
    if (value === null || value === undefined) return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return numeric * this._unitMultiplier(unit);
  }

  _mmToUnit(value, unit) {
    if (value === null || value === undefined) return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const multiplier = this._unitMultiplier(unit);
    if (!multiplier) return numeric;
    return numeric / multiplier;
  }

  _formatNumber(value) {
    if (!Number.isFinite(value)) return '0';
    const abs = Math.abs(value);
    const decimals = abs >= 1000 ? 0 : abs >= 100 ? 1 : 2;
    const rounded = Number(value.toFixed(decimals));
    return rounded.toString();
  }

  _formatGridValue(mmValue) {
    const converted = this._mmToUnit(mmValue, this.gridUnits);
    if (converted === null) return '0';
    return this._formatNumber(converted);
  }

  _gridDisplayUnit(unit) {
    const normalized = this._normalizeUnit(unit);
    if (normalized === 'mm') return 'm';
    if (normalized === 'in') return 'ft';
    return normalized;
  }

  _gridStepCandidates(unit) {
    if (unit === 'in') return GRID_STEP_CANDIDATES.in;
    if (unit === 'ft') return GRID_STEP_CANDIDATES.ft;
    return GRID_STEP_CANDIDATES.default;
  }

  _countSteps(endInclusive, start, step) {
    if (!(step > 0) || !Number.isFinite(step)) return 0;
    return Math.floor((endInclusive - start) / step + 1e-6) + 1;
  }

  _roundKeyValue(value, precision = 1e6) {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * precision) / precision;
  }

  _invalidateGridCache() {
    this._gridCache = null;
  }

  _invalidateConeCache() {
    this._coneRingsCache = null;
  }

  _clampGridPixel(value, size) {
    if (!Number.isFinite(value)) return 0;
    const limit = Math.max(size - 1, 0);
    if (value <= 0) return 0;
    if (value >= limit) return limit;
    return value;
  }

  _computeGridMetrics() {
    const unit = this.gridUnits;
    const unitMm = this._unitMultiplier(unit);
    const pxPerMmX = this.pxPerX || 0;
    const pxPerMmY = this.pxPerY || 0;
    const spanX = Math.max(1, this.xMax - this.xMin);
    const spanY = Math.max(1, this.yMax - this.yMin);
    const candidates = this._gridStepCandidates(unit);
    const minPxSpacing = ZoneMapperCard.GRID_MIN_SPACING_PX;

    const chooseStep = (pxPerMm, spanMm) => {
      for (let scale = 0; scale < 4; scale++) {
        for (const stepUnits of candidates) {
          if (stepUnits <= 0) continue;
          const stepMm = stepUnits * unitMm * Math.pow(10, scale);
          const px = stepMm * pxPerMm;
          if (px >= minPxSpacing) return stepMm;
        }
      }
      const fallback = Math.max(unitMm, spanMm / 10);
      return fallback;
    };

    const stepX = chooseStep(pxPerMmX, spanX);
    const stepY = chooseStep(pxPerMmY, spanY);
    const startX = Math.floor(this.xMin / stepX) * stepX;
    const startY = Math.floor(this.yMin / stepY) * stepY;
    const endX = Math.ceil(this.xMax / stepX) * stepX;
    const endY = Math.ceil(this.yMax / stepY) * stepY;
    const countX = this._countSteps(endX, startX, stepX);
    const countY = this._countSteps(endY, startY, stepY);

    return {
      unit,
      labelUnit: this._gridDisplayUnit(unit),
      stepX,
      stepY,
      startX,
      startY,
      endX,
      endY,
      pxPerMmX,
      pxPerMmY,
      countX,
      countY,
      pixelStartX: this.valueToPixels(startX, 'x'),
      pixelStartY: this.valueToPixels(startY, 'y'),
      skipTolX: stepX * 0.001,
      skipTolY: stepY * 0.001,
      pixelStepX: stepX * pxPerMmX,
      pixelStepY: stepY * pxPerMmY,
    };
  }

  _getGridRenderState() {
    const canvasWidth = this.canvas?.width || 0;
    const canvasHeight = this.canvas?.height || 0;
    const keyParts = [
      this._normalizeUnit(this.gridUnits),
      this._roundKeyValue(this.xMin),
      this._roundKeyValue(this.xMax),
      this._roundKeyValue(this.yMin),
      this._roundKeyValue(this.yMax),
      this._roundKeyValue(this.pxPerX),
      this._roundKeyValue(this.pxPerY),
      canvasWidth,
      canvasHeight,
      this.unitDisplay ? 1 : 0,
      this.unitLabelSize,
    ];
    const key = keyParts.join('|');
    if (this._gridCache && this._gridCache.key === key) {
      return this._gridCache;
    }

    const metrics = this._computeGridMetrics();
    const hasPath2D = typeof Path2D === 'function';
    const gridPath = hasPath2D ? new Path2D() : null;
    const xLines = [];
    const yLines = [];

    let pixelX = metrics.pixelStartX;
    for (let i = 0, x = metrics.startX; i < metrics.countX; i += 1, x += metrics.stepX) {
      const drawX = metrics.pixelStepX ? pixelX : this.valueToPixels(x, 'x');
      if (Number.isFinite(drawX)) {
        xLines.push({ pixel: drawX, value: x });
        if (gridPath) {
          gridPath.moveTo(drawX, 0);
          gridPath.lineTo(drawX, canvasHeight);
        }
      }
      if (metrics.pixelStepX) {
        pixelX += metrics.pixelStepX;
      }
    }

    let pixelY = metrics.pixelStartY;
    for (let i = 0, y = metrics.startY; i < metrics.countY; i += 1, y += metrics.stepY) {
      const drawY = metrics.pixelStepY ? pixelY : this.valueToPixels(y, 'y');
      if (Number.isFinite(drawY)) {
        yLines.push({ pixel: drawY, value: y });
        if (gridPath) {
          gridPath.moveTo(0, drawY);
          gridPath.lineTo(canvasWidth, drawY);
        }
      }
      if (metrics.pixelStepY) {
        pixelY += metrics.pixelStepY;
      }
    }

    const labels = this._buildGridLabels(metrics, xLines, yLines, canvasWidth, canvasHeight);
    this._gridCache = { key, metrics, gridPath, xLines, yLines, labels };
    return this._gridCache;
  }

  _buildGridLabels(metrics, xLines, yLines, canvasWidth, canvasHeight) {
    const labelData = { x: [], y: [] };
    if (!this.unitDisplay) return labelData;

    const y0 = this.valueToPixels(0, 'y');
    let xLabelY;
    let xBaseline;
    if (Number.isFinite(y0) && y0 >= 0 && y0 <= canvasHeight) {
      const margin = 2;
      if (y0 > this.unitLabelSize + margin) {
        xLabelY = y0 - margin;
        xBaseline = 'bottom';
      } else {
        xLabelY = y0 + margin;
        xBaseline = 'top';
      }
    } else {
      xLabelY = canvasHeight - 2;
      xBaseline = 'bottom';
    }

    const width = canvasWidth;
    const height = canvasHeight;

    xLines.forEach(({ pixel, value }) => {
      if (!Number.isFinite(pixel) || pixel < -40 || pixel > width + 40) return;
      if (Math.abs(value) < metrics.skipTolX) return;
      const label = this._formatTickLabel(value, metrics.stepX, metrics.labelUnit);
      labelData.x.push({
        x: pixel,
        y: xLabelY,
        text: label,
        align: 'center',
        baseline: xBaseline,
      });
    });

    const x0 = this.valueToPixels(0, 'x');
    let yLabelX;
    let yAlign;
    if (Number.isFinite(x0) && x0 >= 0 && x0 <= width) {
      const margin = 4;
      if (x0 > this.unitLabelSize + margin * 2) {
        yLabelX = x0 - margin;
        yAlign = 'right';
      } else {
        yLabelX = x0 + margin;
        yAlign = 'left';
      }
    } else {
      yLabelX = 2;
      yAlign = 'left';
    }

    yLines.forEach(({ pixel, value }) => {
      if (!Number.isFinite(pixel) || pixel < -40 || pixel > height + 40) return;
      if (Math.abs(value) < metrics.skipTolY) return;
      const label = this._formatTickLabel(value, metrics.stepY, metrics.labelUnit);
      labelData.y.push({
        x: yLabelX,
        y: pixel,
        text: label,
        align: yAlign,
        baseline: 'middle',
      });
    });

    return labelData;
  }

  _formatTickLabel(mmValue, stepMm, displayUnit) {
    const unitMm = this._unitMultiplier(displayUnit);
    const stepUnits = stepMm / unitMm;
    const isIntegerStep = Math.abs(stepUnits - Math.round(stepUnits)) < 1e-6;
    let decimals = 0;
    if (!isIntegerStep && stepUnits >= 1) decimals = 1;
    else if (stepUnits < 1 && stepUnits >= 0.5) decimals = 1;
    else if (stepUnits < 0.5) decimals = 2;
    const valUnits = this._mmToUnit(mmValue, displayUnit) || 0;
    const rounded = Number(valUnits.toFixed(decimals));
    return `${rounded}${this._unitLabel(displayUnit)}`;
  }

  _persistRotation() {
    if (!this._hass) return;
    this._hass.callService('zone_mapper', 'update_zone', {
      location: this.location,
      rotation_deg: this.coneAngleDeg,
    });
  }

  _setDrawMode(mode) {
    const nextMode = mode || DRAW_MODES.RECT;
    if (this.drawMode === nextMode && !this.isDrawing) {
      this._highlightActiveModeButton();
      this._updatePolygonButtonsVisibility();
      return;
    }
    this.drawMode = nextMode;
    if (this.drawMode !== DRAW_MODES.POLYGON) {
      this._polyPoints = [];
    }
    this._cursorPoint = null;
    this.startPoint = null;
    this.isDrawing = false;
    this._highlightActiveModeButton();
    this._updatePolygonButtonsVisibility();
    this._invalidateGridCache();
    this.drawGrid();
  }

  _highlightActiveModeButton() {
    const rectBtn = this.shadowRoot?.getElementById('btnModeRect');
    const ellipseBtn = this.shadowRoot?.getElementById('btnModeEllipse');
    const polyBtn = this.shadowRoot?.getElementById('btnModePolygon');
    [rectBtn, ellipseBtn, polyBtn].forEach((btn) => {
      if (!btn) return;
      const shouldActivate =
        (btn === rectBtn && this.drawMode === DRAW_MODES.RECT) ||
        (btn === ellipseBtn && this.drawMode === DRAW_MODES.ELLIPSE) ||
        (btn === polyBtn && this.drawMode === DRAW_MODES.POLYGON);
      btn.classList.toggle('active', shouldActivate);
    });
  }

  _setSelectedZone(zoneId) {
    if (zoneId === null || zoneId === undefined) {
      this.selectedZone = null;
      return;
    }
    this.selectedZone = Number(zoneId);
    const buttons = this.shadowRoot?.querySelectorAll('.zone-btn[data-zone-id]');
    if (!buttons) return;
    buttons.forEach((btn) => {
      const targetId = Number(btn.dataset.zoneId);
      btn.classList.toggle('active', targetId === this.selectedZone);
    });
  }

  _resetDrawingState() {
    this.isDrawing = false;
    this._polyPoints = [];
    this._cursorPoint = null;
    this.startPoint = null;
    this._lastPolyTap = 0;
    this._activeInput = null;
  }

  _getZone(zoneId) {
    return this.zones.find((zone) => Number(zone.id) === Number(zoneId)) || null;
  }

  _zoneLabel(zoneId) {
    if (zoneId === null || zoneId === undefined) {
      return 'Zone';
    }
    const numericId = Number(zoneId);
    const configZone = (this.zoneConfig || []).find(
      (zone) => Number(zone.id) === Number(numericId),
    );
    const name = typeof configZone?.name === 'string' ? configZone.name.trim() : '';
    if (name) {
      return name;
    }
    if (!Number.isNaN(numericId)) {
      return `Zone ${numericId}`;
    }
    return `Zone ${zoneId}`;
  }

  _upsertZone(zoneId, shape, data) {
    const index = this.zones.findIndex((zone) => Number(zone.id) === Number(zoneId));
    const entry = { id: Number(zoneId), shape, data };
    if (index === -1) {
      this.zones.push(entry);
    } else {
      this.zones[index] = entry;
    }
  }

  _removeZone(zoneId) {
    const index = this.zones.findIndex((zone) => Number(zone.id) === Number(zoneId));
    if (index !== -1) {
      this.zones.splice(index, 1);
    }
  }

  _clearZone(zoneId, notifyBackend = false) {
    this._removeZone(zoneId);
    if (notifyBackend) {
      this.updateHomeAssistantShape(zoneId, 'none', null);
      const label = this._zoneLabel(zoneId);
      this._notify(`${label} cleared`);
    }
    if (Number(this.selectedZone) === Number(zoneId)) {
      this._resetDrawingState();
    }
    this.drawGrid();
  }

  _clearAllZones() {
    const zoneIds = (this.zoneConfig || []).map((zone) => zone.id);
    this.zones = [];
    this._resetDrawingState();
    this.drawGrid();
    zoneIds.forEach((id) => this.updateHomeAssistantShape(id, 'none', null));
    if (zoneIds.length) {
      this._notify('All zones cleared');
    }
  }

  endDrawing(e) {
    if (!this.isDrawing) return;
    const isTouch = !!(e.changedTouches || e.touches);
    if (
      this._activeInput &&
      ((isTouch && this._activeInput !== 'touch') || (!isTouch && this._activeInput !== 'mouse'))
    ) {
      return;
    }
    if (this.drawMode === DRAW_MODES.POLYGON) {
      // Add a vertex on each mouse/touch end
      const p = this._getPointFromEvent(e);
      const vx = this._clampAndRound(this.pixelsToValue(p.x, 'x'), this.xMin, this.xMax);
      const vy = this._clampAndRound(this.pixelsToValue(p.y, 'y'), this.yMin, this.yMax);
      if (this._polyPoints.length < this.polyMaxPoints) {
        this._polyPoints.push({ x: vx, y: vy });
        // Auto-finish if we hit max and have at least 3 points
        if (this._polyPoints.length === this.polyMaxPoints && this._polyPoints.length >= 3) {
          this.finishPolygon();
          return;
        }
        // Double-tap / double-click detection for finishing polygon on mobile
        const now = Date.now();
        if (this._lastPolyTap && now - this._lastPolyTap < 350) {
          if (this._polyPoints.length >= 3) {
            this.finishPolygon();
            this._lastPolyTap = 0;
            return;
          }
        }
        this._lastPolyTap = now;
      } else {
        // Already at limit, finalize if valid
        if (this._polyPoints.length >= 3) this.finishPolygon();
        return;
      }
      this.drawGrid();
      return;
    }
    this.isDrawing = false;
    if (!this.startPoint) {
      this._activeInput = null;
      return;
    }
    const endPoint = this._getPointFromEvent(e);
    // Convert drawn zones to mm
    let payload = null;
    if (this.drawMode === DRAW_MODES.RECT) {
      const x1 = this.pixelsToValue(this.startPoint.x, 'x');
      const x2 = this.pixelsToValue(endPoint.x, 'x');
      const y1 = this.pixelsToValue(this.startPoint.y, 'y');
      const y2 = this.pixelsToValue(endPoint.y, 'y');
      const xMinRounded = this._clampAndRound(Math.min(x1, x2), this.xMin, this.xMax);
      const xMaxRounded = this._clampAndRound(Math.max(x1, x2), this.xMin, this.xMax);
      const yMinRounded = this._clampAndRound(Math.min(y1, y2), this.yMin, this.yMax);
      const yMaxRounded = this._clampAndRound(Math.max(y1, y2), this.yMin, this.yMax);
      payload = {
        shape: DRAW_MODES.RECT,
        data: {
          x_min: xMinRounded,
          x_max: xMaxRounded,
          y_min: yMinRounded,
          y_max: yMaxRounded,
        },
      };
    } else if (this.drawMode === DRAW_MODES.ELLIPSE) {
      // Bounding box -> ellipse center/radii
      const x1 = this.pixelsToValue(this.startPoint.x, 'x');
      const y1 = this.pixelsToValue(this.startPoint.y, 'y');
      const x2 = this.pixelsToValue(endPoint.x, 'x');
      const y2 = this.pixelsToValue(endPoint.y, 'y');
      const cx = this._clampAndRound((x1 + x2) / 2, this.xMin, this.xMax);
      const cy = this._clampAndRound((y1 + y2) / 2, this.yMin, this.yMax);
      const rx = Math.max(1, Math.round(Math.abs(x2 - x1) / 2));
      const ry = Math.max(1, Math.round(Math.abs(y2 - y1) / 2));
      payload = { shape: DRAW_MODES.ELLIPSE, data: { cx, cy, rx, ry } };
    } else if (this.drawMode === DRAW_MODES.POLYGON) {
      // polygon finalization is handled by dblclick -> finishPolygon()
    }

    if (!payload) return;
    const zoneId = this.selectedZone;
    this._upsertZone(zoneId, payload.shape, payload.data);
    this.drawGrid();
    this.updateHomeAssistantShape(zoneId, payload.shape, payload.data);
    if (zoneId !== null && zoneId !== undefined) {
      const label = this._zoneLabel(zoneId);
      this._notify(`${label} saved`);
    }
    this._activeInput = null;
    this.startPoint = null;
    this._cursorPoint = null;
  }

  _getPointFromEvent(e) {
    if (!this.canvas) return { x: 0, y: 0 };
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    let clientX, clientY;
    if (e.touches && e.touches.length) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  updateHomeAssistantShape(zoneId, shape, data) {
    if (!this._hass) return;
    const numericZoneId = Number(zoneId);
    if (!Number.isFinite(numericZoneId) || numericZoneId <= 0) return;
    this._hass.callService('zone_mapper', 'update_zone', {
      location: this.location,
      zone_id: numericZoneId,
      shape,
      data,
      entities: this.trackedEntities.filter((p) => p.x && p.y),
    });
  }

  updateZonesFromEntities() {
    if (!this._hass) return;
    const sanitizedDevice = slugifyLocation(this.location);
    let restoredEntities = null;
    let namesUpdated = false;
    // Discover zone sensors dynamically if none are configured
    const zoneIds = new Set((this.zoneConfig || []).map((z) => Number(z.id)));
    if (!this.zoneConfig || this.zoneConfig.length === 0) {
      Object.keys(this._hass.states || {}).forEach((eid) => {
        const m = eid.match(/^sensor\.zone_mapper_([a-z0-9_]+)_zone_(\d+)$/);
        if (m && m[1] === sanitizedDevice) zoneIds.add(Number(m[2]));
      });
      // Initialize local config based on discovery (if still empty)
      if (this.zoneConfig.length === 0 && zoneIds.size > 0) {
        this.zoneConfig = Array.from(zoneIds)
          .sort((a, b) => a - b)
          .map((id) => ({ id, name: `Zone ${id}` }));
        this.renderZoneButtons();
        this._renderZoneManager();
      }
    }
    // Load each zone's attributes/state
    Array.from(zoneIds)
      .sort((a, b) => Number(a) - Number(b))
      .forEach((id) => {
        const entityId = `sensor.zone_mapper_${sanitizedDevice}_zone_${id}`;
        const state = this._hass.states[entityId];
        if (!state || !state.attributes) return;
        const attrs = state.attributes;
        if ('shape' in attrs) {
          const shape = attrs.shape;
          const data = attrs.data;
          if (data) {
            this._upsertZone(id, shape, data);
          } else {
            this._removeZone(id);
          }
        }
        // name propagation from backend (if present)
        if (attrs.name) {
          const zc = this.zoneConfig.find((z) => Number(z.id) === Number(id));
          if (zc && zc.name !== attrs.name) {
            zc.name = attrs.name;
            namesUpdated = true;
          }
        }
        if (typeof attrs.rotation_deg === 'number') {
          const nextAngle = this._clampConeAngle(Math.round(attrs.rotation_deg));
          if (nextAngle !== this.coneAngleDeg) {
            this.coneAngleDeg = nextAngle;
            this._invalidateConeCache();
          }
          const angleSlider = this.shadowRoot.getElementById('coneAngleSlider');
          const angleLabel = this.shadowRoot.getElementById('coneAngleLabel');
          if (angleSlider) angleSlider.value = String(this.coneAngleDeg);
          if (angleLabel) angleLabel.textContent = `${this.coneAngleDeg}°`;
        }
        if (Array.isArray(attrs.entities) && attrs.entities.length) {
          restoredEntities = attrs.entities;
        }
      });
    if (restoredEntities && (!this.trackedEntities || this.trackedEntities.length === 0)) {
      this.trackedEntities = restoredEntities.filter((p) => p && p.x && p.y);
      // Try to set selected device from first pair
      const first = this.trackedEntities[0];
      const eInfo = this._findEntityInfo(first?.x) || this._findEntityInfo(first?.y);
      if (eInfo) this._selectedDeviceId = eInfo.device_id || null;
      this._renderEntitySelection();
    }
    if (namesUpdated) {
      this.renderZoneButtons();
      this._renderZoneManager();
    }
    this.drawGrid();
  }

  _renderZoneManager() {
    const host = this.shadowRoot?.getElementById('zoneManager');
    if (!host) return;
    host.innerHTML = '';
    const zones = (this.zoneConfig || []).slice().sort((a, b) => Number(a.id) - Number(b.id));
    zones.forEach((z) => {
      const row = document.createElement('div');
      row.className = 'entity-row';
      const label = document.createElement('label');
      label.textContent = `Zone ${z.id}`;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = z.name || `Zone ${z.id}`;
      input.placeholder = `Zone ${z.id}`;
      const saveBtn = document.createElement('button');
      saveBtn.textContent = 'Save';
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';

      saveBtn.addEventListener('click', () => {
        const newName = input.value?.trim() || `Zone ${z.id}`;
        z.name = newName;
        // Persist the friendly name to backend (no shape/data change)
        if (this._hass) {
          const zoneId = Number(z.id);
          if (!Number.isFinite(zoneId) || zoneId <= 0) {
            this._notify('Unable to save name: invalid zone id');
            return;
          }
          this._hass.callService('zone_mapper', 'update_zone', {
            location: this.location,
            zone_id: zoneId,
            name: newName,
          });
        }
        this.renderZoneButtons();
        this.drawGrid();
        this._notify(`${this._zoneLabel(z.id)} saved`);
      });

      delBtn.addEventListener('click', () => {
        const label = this._zoneLabel(z.id);
        // Delete the zone and remove its entities
        if (this._hass) {
          const zoneId = Number(z.id);
          if (!Number.isFinite(zoneId) || zoneId <= 0) {
            this._notify('Unable to delete: invalid zone id');
            return;
          }
          this._hass.callService('zone_mapper', 'update_zone', {
            location: this.location,
            zone_id: zoneId,
            delete: true,
          });
        }
        // Remove from UI state
        this.zoneConfig = (this.zoneConfig || []).filter((zz) => String(zz.id) !== String(z.id));
        this.zones = (this.zones || []).filter((zz) => String(zz.id) !== String(z.id));
        if (String(this.selectedZone) === String(z.id)) this.selectedZone = null;
        this.renderZoneButtons();
        this._renderZoneManager();
        this.drawGrid();
        this._notify(`${label} deleted`);
      });

      row.appendChild(label);
      row.appendChild(input);
      row.appendChild(saveBtn);
      row.appendChild(delBtn);
      host.appendChild(row);
    });
  }

  _handleAddZone() {
    // Compute next available id
    const ids = new Set([
      ...(this.zoneConfig || []).map((z) => Number(z.id)),
      ...(this.zones || []).map((z) => Number(z.id)),
    ]);
    let next = 1;
    while (ids.has(next)) next += 1;
    const newZone = { id: next, name: `Zone ${next}` };
    this.zoneConfig = [...(this.zoneConfig || []), newZone];
    this.selectedZone = next;
    // Persist empty zone with name so entities are created and named
    if (this._hass) {
      this._hass.callService('zone_mapper', 'update_zone', {
        location: this.location,
        zone_id: next,
        shape: 'none',
        data: null,
        name: newZone.name,
      });
    }
    this.renderZoneButtons();
    this._renderZoneManager();
  }

  finishPolygon() {
    if (this._polyPoints.length >= 3 && this.selectedZone !== null) {
      // Enforce max points on commit
      if (this._polyPoints.length > this.polyMaxPoints) {
        this._polyPoints = this._polyPoints.slice(0, this.polyMaxPoints);
      }
      const zoneId = this.selectedZone;
      const points = this._polyPoints.slice(0, this.polyMaxPoints).map((pt) => ({
        x: this._clampAndRound(pt.x, this.xMin, this.xMax),
        y: this._clampAndRound(pt.y, this.yMin, this.yMax),
      }));
      const payload = {
        shape: DRAW_MODES.POLYGON,
        data: { points },
      };
      this._upsertZone(zoneId, payload.shape, payload.data);
      this.updateHomeAssistantShape(zoneId, payload.shape, payload.data);
      if (zoneId !== null && zoneId !== undefined) {
        const label = this._zoneLabel(zoneId);
        this._notify(`${label} saved`);
      }
    }
    this._resetDrawingState();
    this.drawGrid();
  }

  drawGrid() {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const gridState = this._getGridRenderState();
    const gridMetrics = gridState?.metrics;
    if (gridState) {
      this._drawGridLines(ctx, gridState);
    }
    this._drawAxes(ctx);
    if (this.unitDisplay && gridState) {
      this._drawGridLabels(ctx, gridState.labels);
    }

    this.drawDeviceCone(gridMetrics);

    this.drawZones();
    this._drawInProgress();
    this._drawTrackedTargets();
  }

  _drawGridLines(ctx, gridState) {
    if (!gridState) return;
    ctx.strokeStyle = COLOR.canvas.gridLine;
    ctx.lineWidth = 1;
    if (gridState.gridPath) {
      ctx.stroke(gridState.gridPath);
      return;
    }

    const { xLines, yLines } = gridState;
    if ((!xLines || !xLines.length) && (!yLines || !yLines.length)) return;

    ctx.beginPath();
    if (xLines && xLines.length) {
      xLines.forEach(({ pixel }) => {
        ctx.moveTo(pixel, 0);
        ctx.lineTo(pixel, this.canvas.height);
      });
    }
    if (yLines && yLines.length) {
      yLines.forEach(({ pixel }) => {
        ctx.moveTo(0, pixel);
        ctx.lineTo(this.canvas.width, pixel);
      });
    }
    ctx.stroke();
  }

  _drawAxes(ctx) {
    const originColor = this.darkMode ? COLOR.canvas.axisDark : COLOR.canvas.axisLight;
    ctx.strokeStyle = originColor;
    ctx.lineWidth = 1.5;

    const y0 = this.valueToPixels(0, 'y');
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.lineTo(this.canvas.width, y0);
    ctx.stroke();

    const x0 = this.valueToPixels(0, 'x');
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0, this.canvas.height);
    ctx.stroke();

    ctx.fillStyle = originColor;
    ctx.beginPath();
    ctx.arc(x0, y0, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawGridLabels(ctx, labels) {
    if (!labels) return;
    const axisColor = this.darkMode ? COLOR.canvas.axisDark : COLOR.canvas.axisLight;
    ctx.save();
    ctx.fillStyle = axisColor;
    ctx.font = `${this.unitLabelSize}px sans-serif`;
    if (labels.x && labels.x.length) {
      labels.x.forEach((item) => {
        ctx.textAlign = item.align;
        ctx.textBaseline = item.baseline;
        ctx.fillText(item.text, item.x, item.y);
      });
    }

    if (labels.y && labels.y.length) {
      labels.y.forEach((item) => {
        ctx.textAlign = item.align;
        ctx.textBaseline = item.baseline;
        ctx.fillText(item.text, item.x, item.y);
      });
    }

    ctx.restore();
  }

  _drawTrackedTargets() {
    if (!this._hass) return;
    const colors = COLOR.canvas.targetPalette;
    const theta = ((this.coneAngleDeg || 0) * Math.PI) / 180;
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);
    const rotatePoint = (x, y) => ({
      x: x * cosTheta + y * sinTheta,
      y: -x * sinTheta + y * cosTheta,
    });
    const multiplier = this.inputUnitMultiplier || 1;
    this.trackedEntities.forEach((pair, idx) => {
      if (!pair.x || !pair.y) return;
      const stateX = this._hass.states[pair.x];
      const stateY = this._hass.states[pair.y];
      if (!stateX || !stateY) return;
      const xRaw = parseFloat(stateX.state);
      const yRaw = parseFloat(stateY.state);
      if (Number.isNaN(xRaw) || Number.isNaN(yRaw)) return;
      const xVal = xRaw * multiplier;
      const yVal = yRaw * multiplier;
      const rotated = rotatePoint(xVal, yVal);
      this.drawCurrentPosition(rotated.x, rotated.y, colors[idx % colors.length]);
    });
  }

  drawZones() {
    const ctx = this.ctx;
    const colors = COLOR.canvas.zonePalette;
    const orderedZones = [...this.zones].sort((a, b) => Number(a.id) - Number(b.id));
    orderedZones.forEach((zone, idx) => {
      if (!zone || !zone.shape || !zone.data) return;
      const color = colors[(Number(zone.id) - 1) % colors.length] || colors[idx % colors.length];
      ctx.strokeStyle = color.replace('0.30', '1');
      ctx.fillStyle = color;
      ctx.lineWidth = 3;
      let bbox = null; // {x,y,width,height}
      if (zone.shape === DRAW_MODES.RECT) {
        const { x_min, x_max, y_min, y_max } = zone.data;
        const x1 = this.valueToPixels(x_min, 'x');
        const y1 = this.valueToPixels(y_min, 'y');
        const x2 = this.valueToPixels(x_max, 'x');
        const y2 = this.valueToPixels(y_max, 'y');
        const x = Math.min(x1, x2);
        const y = Math.min(y1, y2);
        const width = Math.abs(x2 - x1);
        const height = Math.abs(y2 - y1);
        ctx.fillRect(x, y, width, height);
        ctx.strokeRect(x, y, width, height);
        bbox = { x, y, width, height };
      } else if (zone.shape === DRAW_MODES.ELLIPSE) {
        const { cx, cy, rx, ry } = zone.data;
        const cxPix = this.valueToPixels(cx, 'x');
        const cyPix = this.valueToPixels(cy, 'y');
        const rxPix = Math.abs(this.valueToPixels(cx + rx, 'x') - this.valueToPixels(cx, 'x'));
        const ryPix = Math.abs(this.valueToPixels(cy + ry, 'y') - this.valueToPixels(cy, 'y'));
        ctx.beginPath();
        ctx.ellipse(cxPix, cyPix, rxPix, ryPix, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        bbox = { x: cxPix - rxPix, y: cyPix - ryPix, width: rxPix * 2, height: ryPix * 2 };
      } else if (zone.shape === DRAW_MODES.POLYGON && Array.isArray(zone.data.points)) {
        const pts = zone.data.points.map((point) => ({
          x: this.valueToPixels(point.x, 'x'),
          y: this.valueToPixels(point.y, 'y'),
        }));
        if (pts.length >= 3) {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          // Compute bounding box
          let minX = pts[0].x,
            minY = pts[0].y,
            maxX = pts[0].x,
            maxY = pts[0].y;
          for (let i = 1; i < pts.length; i++) {
            if (pts[i].x < minX) minX = pts[i].x;
            if (pts[i].y < minY) minY = pts[i].y;
            if (pts[i].x > maxX) maxX = pts[i].x;
            if (pts[i].y > maxY) maxY = pts[i].y;
          }
          bbox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        }
      }
      if (bbox && bbox.width > 20 && bbox.height > 14) {
        this._drawZoneLabel(zone, bbox);
      }
    });
  }

  _drawInProgress() {
    const ctx = this.ctx;
    // Draw in-progress indicators
    if (this.drawMode === DRAW_MODES.POLYGON && this.isDrawing) {
      const pts = (this._polyPoints || []).map((p) => ({
        x: this.valueToPixels(p.x, 'x'),
        y: this.valueToPixels(p.y, 'y'),
      }));
      if (pts.length >= 2) {
        ctx.save();
        ctx.strokeStyle = this.darkMode
          ? COLOR.canvas.polygonStrokeDark
          : COLOR.canvas.polygonStrokeLight;
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        ctx.restore();
      }
      // Rubber-band from last point to first
      if (this._cursorPoint && (pts.length || this.startPoint)) {
        const cur = this._cursorPoint;
        const previewColor = this.darkMode
          ? COLOR.canvas.polygonPreviewDark
          : COLOR.canvas.polygonPreviewLight;
        ctx.save();
        ctx.strokeStyle = previewColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        const anchor = pts.length
          ? pts[pts.length - 1]
          : { x: this.startPoint?.x ?? null, y: this.startPoint?.y ?? null };
        if (anchor.x != null && anchor.y != null) {
          ctx.moveTo(anchor.x, anchor.y);
          ctx.lineTo(cur.x, cur.y);
        }
        if (pts.length >= 1) {
          const first = pts[0];
          ctx.moveTo(cur.x, cur.y);
          ctx.lineTo(first.x, first.y);
        }
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      const fill = this.darkMode
        ? COLOR.canvas.polygonVertexFillDark
        : COLOR.canvas.polygonVertexFillLight;
      const stroke = this.darkMode
        ? COLOR.canvas.polygonVertexStrokeDark
        : COLOR.canvas.polygonVertexStrokeLight;
      for (const pt of pts) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }

      if (!pts.length && this.startPoint) {
        ctx.beginPath();
        ctx.arc(this.startPoint.x, this.startPoint.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }
      ctx.restore();
    } else if (
      this.isDrawing &&
      this.startPoint &&
      (this.drawMode === DRAW_MODES.RECT || this.drawMode === DRAW_MODES.ELLIPSE)
    ) {
      const pt = this.startPoint;
      ctx.save();
      const fill = this.darkMode
        ? COLOR.canvas.polygonVertexFillDark
        : COLOR.canvas.polygonVertexFillLight;
      const stroke = this.darkMode
        ? COLOR.canvas.polygonVertexStrokeDark
        : COLOR.canvas.polygonVertexStrokeLight;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = stroke;
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawZoneLabel(zone, bbox) {
    const ctx = this.ctx;
    const label = this._zoneLabel(zone.id);
    if (!label) return;
    ctx.save();
    ctx.font = '24px sans-serif';
    ctx.fillStyle = this.darkMode ? COLOR.canvas.axisDark : COLOR.canvas.axisLight;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = this.darkMode
      ? COLOR.canvas.polygonVertexStrokeDark
      : COLOR.canvas.polygonVertexStrokeLight;
    ctx.shadowBlur = 2;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Shape center; polygons use centroid, others use bbox center
    let cx = bbox.x + bbox.width / 2;
    let cy = bbox.y + bbox.height / 2;
    if (
      zone.shape === DRAW_MODES.POLYGON &&
      Array.isArray(zone.data?.points) &&
      zone.data.points.length >= 3
    ) {
      let A = 0,
        Cx = 0,
        Cy = 0;
      for (let i = 0, j = zone.data.points.length - 1; i < zone.data.points.length; j = i++) {
        const xi = this.valueToPixels(zone.data.points[i].x, 'x');
        const yi = this.valueToPixels(zone.data.points[i].y, 'y');
        const xj = this.valueToPixels(zone.data.points[j].x, 'x');
        const yj = this.valueToPixels(zone.data.points[j].y, 'y');
        const cross = xi * yj - xj * yi;
        A += cross;
        Cx += (xi + xj) * cross;
        Cy += (yi + yj) * cross;
      }
      A *= 0.5;
      if (Math.abs(A) > 1e-6) {
        cx = Cx / (6 * A);
        cy = Cy / (6 * A);
      }
    }
    ctx.fillText(label, cx, cy);
    ctx.restore();
  }

  drawDeviceCone(gridMetrics) {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const apex = { x: 0, y: 0 };

    const halfFovRad = ((this.coneFovDeg / 2) * Math.PI) / 180;
    const phiL = -halfFovRad;
    const phiR = halfFovRad;

    // Apply rotation; positive rotates to device's right
    const rotRad = (this.coneAngleDeg * Math.PI) / 180;
    let thetaStart = phiL + rotRad;
    let thetaEnd = phiR + rotRad;
    if (thetaStart > thetaEnd) {
      const tmp = thetaStart;
      thetaStart = thetaEnd;
      thetaEnd = tmp;
    }

    const radius = Math.max(0, this.coneYMax);
    const ax = this.valueToPixels(apex.x, 'x');
    const ay = this.valueToPixels(apex.y, 'y');

    // Point on arc at angle ang on circle with radius
    const pAt = (ang) => ({ x: radius * Math.sin(ang), y: radius * Math.cos(ang) });
    const L = pAt(thetaStart);
    const lx = this.valueToPixels(L.x, 'x');
    const ly = this.valueToPixels(L.y, 'y');

    // Build filled sector: apex -> left ray -> arc -> right ray -> apex
    const segments = 48;
    const step = (thetaEnd - thetaStart) / segments;

    ctx.save();
    ctx.fillStyle = COLOR.canvas.deviceConeFill;
    ctx.strokeStyle = COLOR.canvas.deviceConeStroke;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(lx, ly);
    for (let i = 1; i <= segments; i++) {
      const ang = thetaStart + step * i;
      const pt = pAt(ang);
      const px = this.valueToPixels(pt.x, 'x');
      const py = this.valueToPixels(pt.y, 'y');
      ctx.lineTo(px, py);
    }
    ctx.lineTo(ax, ay);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Draw range rings and labels within the cone when unit labels are enabled
    if (this.unitDisplay) {
      this._drawConeRings(thetaStart, thetaEnd, radius, gridMetrics);
    }
  }

  _getConeRingsRenderState(thetaStart, thetaEnd, radius, gridMetrics) {
    if (!this.unitDisplay) return null;
    if (!Number.isFinite(radius) || radius <= 0) return null;
    const angleSpan = thetaEnd - thetaStart;
    if (!Number.isFinite(angleSpan) || Math.abs(angleSpan) < 1e-6) return null;

    const gridUnit = gridMetrics ? gridMetrics.unit : this.gridUnits;
    const imperial = gridUnit === 'in' || gridUnit === 'ft';
    const labelUnit = imperial ? 'ft' : 'm';
    const stepUnits = imperial ? 4 : 1;
    const stepMm = stepUnits * this._unitMultiplier(labelUnit);
    if (!Number.isFinite(stepMm) || stepMm <= 0) return null;

    const pxPerMmX = gridMetrics ? gridMetrics.pxPerMmX : this.pxPerX || 0;
    const pxPerMmY = gridMetrics ? gridMetrics.pxPerMmY : this.pxPerY || 0;
    if (!pxPerMmX || !pxPerMmY) return null;

    const keyParts = [
      this._roundKeyValue(thetaStart),
      this._roundKeyValue(thetaEnd),
      this._roundKeyValue(radius),
      this._roundKeyValue(pxPerMmX),
      this._roundKeyValue(pxPerMmY),
      this._roundKeyValue(this.xMin),
      this._roundKeyValue(this.yMin),
      labelUnit,
      stepMm,
      this.canvas?.width || 0,
      this.canvas?.height || 0,
    ];
    const key = keyParts.join('|');
    if (this._coneRingsCache && this._coneRingsCache.key === key) {
      return this._coneRingsCache;
    }

    const hasPath2D = typeof Path2D === 'function';
    const ringsPath = hasPath2D ? new Path2D() : null;
    const rings = [];
    const labels = [];

    const segments = 48;
    const angStep = angleSpan / segments;
    const sinStep = Math.sin(angStep);
    const cosStep = Math.cos(angStep);
    const sinStart = Math.sin(thetaStart);
    const cosStart = Math.cos(thetaStart);
    const offsetX = -this.xMin * pxPerMmX;
    const offsetY = -this.yMin * pxPerMmY;

    for (let r = stepMm; r <= radius + 1e-6; r += stepMm) {
      let sinAng = sinStart;
      let cosAng = cosStart;
      const points = [];
      for (let i = 0; i <= segments; i++) {
        const x = r * sinAng;
        const y = r * cosAng;
        const px = x * pxPerMmX + offsetX;
        const py = y * pxPerMmY + offsetY;
        points.push([px, py]);
        if (i < segments) {
          const nextSin = sinAng * cosStep + cosAng * sinStep;
          const nextCos = cosAng * cosStep - sinAng * sinStep;
          sinAng = nextSin;
          cosAng = nextCos;
        }
      }
      if (ringsPath && points.length) {
        ringsPath.moveTo(points[0][0], points[0][1]);
        for (let idx = 1; idx < points.length; idx += 1) {
          ringsPath.lineTo(points[idx][0], points[idx][1]);
        }
      }
      rings.push(points);

      const mid = (thetaStart + thetaEnd) / 2;
      const lx = r * Math.sin(mid) * pxPerMmX + offsetX;
      const ly = r * Math.cos(mid) * pxPerMmY + offsetY;
      labels.push({
        x: lx,
        y: ly,
        text: this._formatTickLabel(r, stepMm, labelUnit),
      });
    }

    this._coneRingsCache = { key, path: ringsPath, rings, labels };
    return this._coneRingsCache;
  }

  _drawConeRings(thetaStart, thetaEnd, radius, gridMetrics) {
    const ctx = this.ctx;
    if (!ctx) return;
    const state = this._getConeRingsRenderState(thetaStart, thetaEnd, radius, gridMetrics);
    if (!state) return;

    const axisColor = this.darkMode ? COLOR.canvas.axisDark : COLOR.canvas.axisLight;
    ctx.save();
    ctx.strokeStyle = COLOR.canvas.deviceConeStroke;
    ctx.lineWidth = 1;
    ctx.font = `${this.unitLabelSize}px sans-serif`;
    ctx.fillStyle = axisColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (state.path) {
      ctx.stroke(state.path);
    } else if (state.rings && state.rings.length) {
      ctx.beginPath();
      state.rings.forEach((points) => {
        if (!points.length) return;
        ctx.moveTo(points[0][0], points[0][1]);
        for (let idx = 1; idx < points.length; idx += 1) {
          ctx.lineTo(points[idx][0], points[idx][1]);
        }
      });
      ctx.stroke();
    }

    if (state.labels && state.labels.length) {
      state.labels.forEach((label) => {
        ctx.fillText(label.text, label.x, label.y);
      });
    }

    ctx.restore();
  }

  setupCanvas() {
    this.canvas = this.shadowRoot.getElementById('zoneCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = 800;
    this.canvas.height = 800;
    const safeWidth = Math.max(1, this.xMax - this.xMin);
    const safeHeight = Math.max(1, this.yMax - this.yMin);
    this.pxPerX = this.canvas.width / safeWidth;
    this.pxPerY = this.canvas.height / safeHeight;
    this._invalidateGridCache();
    this._invalidateConeCache();
    this.drawGrid();
  }

  startDrawing(e) {
    if (this.isLocked) {
      const now = Date.now();
      if (!this._lastLockWarningTs || now - this._lastLockWarningTs > 1500) {
        this._notify('Unlock the grid before drawing.');
        this._lastLockWarningTs = now;
      }
      return;
    }
    if (this.selectedZone === null) return;
    if (!this.canvas) return;
    this.isDrawing = true;
    this._activeInput = e.touches ? 'touch' : 'mouse';
    this.startPoint = this._getPointFromEvent(e);
    this._cursorPoint = this.startPoint;
    this.drawGrid();
  }

  draw(e) {
    if (this.isLocked || !this.isDrawing) return;
    const isTouch = !!(e.touches || e.changedTouches);
    if (
      this._activeInput &&
      ((isTouch && this._activeInput !== 'touch') || (!isTouch && this._activeInput !== 'mouse'))
    ) {
      return;
    }
    const currentPoint = this._getPointFromEvent(e);
    // polygon cache cursor point
    if (this.drawMode === DRAW_MODES.POLYGON) {
      this._cursorPoint = currentPoint;
      this.drawGrid();
      return;
    }
    this.drawGrid();
    const ctx = this.ctx;
    ctx.strokeStyle = this.darkMode ? COLOR.canvas.drawStrokeDark : COLOR.canvas.drawStrokeLight;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    const width = currentPoint.x - this.startPoint.x;
    const height = currentPoint.y - this.startPoint.y;
    if (this.drawMode === DRAW_MODES.RECT) {
      ctx.strokeRect(this.startPoint.x, this.startPoint.y, width, height);
    } else if (this.drawMode === DRAW_MODES.ELLIPSE) {
      ctx.beginPath();
      ctx.ellipse(
        this.startPoint.x + width / 2,
        this.startPoint.y + height / 2,
        Math.abs(width) / 2,
        Math.abs(height) / 2,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  valueToPixels(val, axis) {
    if (axis === 'x') {
      return (val - this.xMin) * (this.pxPerX || 0);
    } else {
      // Y increases downward: map directly without flipping
      return (val - this.yMin) * (this.pxPerY || 0);
    }
  }

  pixelsToValue(pix, axis) {
    if (axis === 'x') {
      if (!this.pxPerX) return this.xMin;
      return pix / this.pxPerX + this.xMin;
    } else {
      // Inverse of valueToPixels when Y increases downward
      if (!this.pxPerY) return this.yMin;
      return this.yMin + pix / this.pxPerY;
    }
  }

  getCardSize() {
    return 8;
  }

  _updatePolygonButtonsVisibility() {
    const undo = this.shadowRoot.getElementById('btnPolyUndo');
    const fin = this.shadowRoot.getElementById('btnPolyFinish');
    const show = this.drawMode === DRAW_MODES.POLYGON;
    [undo, fin].forEach((btn) => {
      if (!btn) return;
      btn.style.display = show ? 'block' : 'none';
    });
  }

  cancelDrawing() {
    this._resetDrawingState();
    this.drawGrid();
  }

  disconnectedCallback() {
    this._detachGlobalListeners();
  }

  _detachGlobalListeners() {
    if (this._onKeyDown) {
      window.removeEventListener('keydown', this._onKeyDown);
      this._onKeyDown = null;
    }
    if (this._outsideClickHandler) {
      document.removeEventListener('mousedown', this._outsideClickHandler, true);
      document.removeEventListener('touchstart', this._outsideClickHandler, true);
      this._outsideClickHandler = null;
    }
  }

  async _ensureRegistriesLoaded() {
    try {
      const [devices, entities] = await Promise.all([
        this._hass.callWS({ type: 'config/device_registry/list' }),
        this._hass.callWS({ type: 'config/entity_registry/list' }),
      ]);
      this._devices = Array.isArray(devices) ? devices : [];
      this._allEntities = Array.isArray(entities) ? entities : [];
      // Try to pick a default device for the location if any entity matches restored pairs
      if (!this._selectedDeviceId && this.trackedEntities && this.trackedEntities.length) {
        const info =
          this._findEntityInfo(this.trackedEntities[0]?.x) ||
          this._findEntityInfo(this.trackedEntities[0]?.y);
        if (info) this._selectedDeviceId = info.device_id;
      }
      this._renderEntitySelection();
    } catch {
      // Silently ignore; dropdowns will remain empty
      // console.warn('Failed to load registries', _e);
    }
  }

  _renderEntitySelection() {
    const devSel = this.shadowRoot?.getElementById('deviceSelect');
    const pairsDiv = this.shadowRoot?.getElementById('entityPairs');
    if (!devSel || !pairsDiv) return;

    // Populate device select
    devSel.innerHTML = '';
    const devices = this._devices || [];
    const mkOpt = (val, label) => {
      const o = document.createElement('option');
      o.value = val || '';
      o.textContent = label;
      return o;
    };
    devSel.appendChild(mkOpt('', '— Select device —'));
    devices.forEach((d) => {
      const label = d.name_by_user || d.name || d.id;
      const opt = mkOpt(d.id, label);
      if (String(d.id) === String(this._selectedDeviceId)) opt.selected = true;
      devSel.appendChild(opt);
    });

    // Build options for entities belonging to selected device (sensors only)
    const deviceEntities = (this._allEntities || []).filter(
      (e) => !this._selectedDeviceId || e.device_id === this._selectedDeviceId,
    );
    const sensorEntityIds = deviceEntities
      .filter((e) => e.entity_id || '')
      .map((e) => e.entity_id)
      .sort((a, b) => a.localeCompare(b));

    // Render pairs
    pairsDiv.innerHTML = '';
    const pairs = this.trackedEntities && this.trackedEntities.length ? this.trackedEntities : [];
    pairs.forEach((pair, idx) => {
      const row = document.createElement('div');
      row.className = 'entity-row';
      const label = document.createElement('label');
      label.textContent = `Target ${idx + 1}`;
      const selX = document.createElement('select');
      const selY = document.createElement('select');
      const rmBtn = document.createElement('button');
      rmBtn.textContent = 'Remove';
      rmBtn.addEventListener('click', () => {
        this.trackedEntities.splice(idx, 1);
        this._renderEntitySelection();
        this.drawGrid();
      });

      const addOptions = (sel, currentVal) => {
        sel.innerHTML = '';
        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = '— Select entity —';
        sel.appendChild(noneOpt);
        sensorEntityIds.forEach((id) => {
          const o = document.createElement('option');
          o.value = id;
          o.textContent = id;
          if (currentVal && id === currentVal) o.selected = true;
          sel.appendChild(o);
        });
      };
      addOptions(selX, pair.x);
      addOptions(selY, pair.y);

      selX.addEventListener('change', () => {
        this.trackedEntities[idx].x = selX.value || '';
        this.drawGrid();
      });
      selY.addEventListener('change', () => {
        this.trackedEntities[idx].y = selY.value || '';
        this.drawGrid();
      });

      row.appendChild(label);
      row.appendChild(selX);
      row.appendChild(selY);
      row.appendChild(rmBtn);
      pairsDiv.appendChild(row);
    });
  }

  _findEntityInfo(entityId) {
    if (!entityId) return null;
    return (this._allEntities || []).find((e) => e.entity_id === entityId) || null;
  }

  _suggestPairsFromDevice(forceReplace = false) {
    if (!this._selectedDeviceId) return false;
    const list = (this._allEntities || []).filter(
      (e) => e.device_id === this._selectedDeviceId && (e.entity_id || ''),
    );
    const xs = list.filter(
      (e) => /(^|[_-])x(\b|[_-])/.test(e.entity_id) || /_x$/.test(e.entity_id),
    );
    const ys = list.filter(
      (e) => /(^|[_-])y(\b|[_-])/.test(e.entity_id) || /_y$/.test(e.entity_id),
    );
    const pairs = [];
    const used = new Set();
    // Try to pair by replacing x->y in name
    xs.forEach((xe) => {
      const guessY = xe.entity_id.replace(/x(?!.*x)/, 'y').replace(/_x(?!.*_x)/, '_y');
      const ye = list.find((e) => e.entity_id === guessY) || ys.find((e) => !used.has(e.entity_id));
      if (ye) {
        used.add(ye.entity_id);
        pairs.push({ x: xe.entity_id, y: ye.entity_id });
      }
    });
    // Fallback: take numeric-looking entities two by two
    if (pairs.length === 0) {
      const numeric = list
        .map((e) => e.entity_id)
        .filter((id) => {
          const st = this._hass?.states[id];
          return (
            st &&
            st.state !== 'unknown' &&
            st.state !== 'unavailable' &&
            !Number.isNaN(parseFloat(st.state))
          );
        });
      for (let i = 0; i + 1 < numeric.length; i += 2) {
        pairs.push({ x: numeric[i], y: numeric[i + 1] });
      }
    }
    if (pairs.length) {
      // Replace existing pairs when forced or when nothing is set yet
      if (forceReplace || !this.trackedEntities || this.trackedEntities.length === 0) {
        this.trackedEntities = pairs;
        return true;
      }
      return false;
    }
    // If forced and no pairs found, clear to avoid stale pairs from previous device
    if (forceReplace) {
      this.trackedEntities = [];
    }
    return false;
  }

  _notify(message) {
    try {
      const ev = new Event('hass-notification', { bubbles: true, composed: true });
      ev.detail = { message };
      this.dispatchEvent(ev);
    } catch {
      alert(message);
    }
  }
}

customElements.define('zone-mapper-card', ZoneMapperCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'zone-mapper-card',
  name: 'Zone Mapper Card',
  description: 'Draw and manage detection zones for devices',
});
