class ZoneMapperCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.darkMode = false;
    this.zones = [];
    this.selectedZone = null;
    this.isDrawing = false;
    this.startPoint = null;
    this.entitiesPopulated = false;
    this.trackedEntities = [];
    // Drawing modes: 'rect' | 'ellipse' | 'polygon'
    this.drawMode = 'rect';
    this._polyPoints = [];

    // Default card grid ranges in millimeters
    this.xMin = -5000;
    this.xMax = 5000;
    this.yMin = 0;
    this.yMax = 10000;

    // Helper device FOV overlay settings
    // coneYMax is the displayed range (mm). FOV is total degrees (default 120° => ±60°).
    this.coneYMax = 6000;
    this.coneFovDeg = 120;
    this.coneAngleDeg = 0;
    this.coneAngleDefault = 0;
    this.polyMaxPoints = 32;
    // UI state
    this.showModeMenu = false; // collapsible draw mode menu
    this.isLocked = false;     // lock drawing interactions
  }

  // Default stub config
  static getStubConfig() {
    return {
      type: 'custom:zone-mapper-card',
      location: 'Office',
      dark_mode: false,
      // Optional generator-style inputs (default behavior)
      // When provided (and direct_entity is not true), the card will auto-build
      // X/Y entity ids as: sensor.<device>_<id>_<sensor>_target_<n>_<x|y>
      device: 'device name',
      id: 'unique id',
      sensor: 'ld2450',
      target_count: 3,
      zones: [
        { id: 1, name: 'Zone 1' },
        { id: 2, name: 'Zone 2' },
        { id: 3, name: 'Zone 3' },
      ],
      grid: {
        x_min: -5000,
        x_max: 5000,
        y_min: 0,
        y_max: 10000,
      },
      // Grid is y-down oriented, so y_min is top, y_max is bottom
      cone: {
        y_max: 6000,
        fov_deg: 120,
        angle_deg: 0,
      },
      // To use explicit entity ids instead of generator, set direct_entity: true and
      // provide the entities array in the style shown below.
      // direct_entity: true,
      // entities: [
      //   { x1: 'sensor.apollo_r_pro_1_w_351af0_ld2450_target_1_x' },
      //   { y1: 'sensor.apollo_r_pro_1_w_351af0_ld2450_target_1_y' },
      //   ...
      // ],
    };
  }

  setConfig(config) {
    // Require `location` for naming/UI and backend key
    if (!config.location) {
      throw new Error("You must specify a location.");
    }
    if (!config.zones || !Array.isArray(config.zones)) {
      throw new Error("You must specify a list of zones.");
    }

    this.config = config;
    // Resolve location name used for UI, entity restoration, and backend
    this.location = String(config.location);

    // Generator inputs (optional)
    this.devicePrefix = config.device !== undefined ? String(config.device) : undefined;
    this.deviceId = config.id !== undefined ? String(config.id) : undefined;
    this.sensorName = config.sensor !== undefined ? String(config.sensor) : undefined;
    this.targetCount = Number(config.target_count);
    this.directEntity = !!config.direct_entity;

    this.zoneConfig = config.zones;
    this.trackedEntities = this.buildTrackedEntities(config);

    if (config.dark_mode !== undefined) {
      this.darkMode = !!config.dark_mode;
    }

    if (config.grid && typeof config.grid === 'object') {
      const g = config.grid;
      if (g.x_min !== undefined) this.xMin = g.x_min;
      if (g.x_max !== undefined) this.xMax = g.x_max;
      if (g.y_min !== undefined) this.yMin = g.y_min;
      if (g.y_max !== undefined) this.yMax = g.y_max;
    }

    if (config.cone && typeof config.cone === 'object') {
      const c = config.cone;
      if (c.y_max !== undefined) this.coneYMax = c.y_max;
      if (c.fov_deg !== undefined) {
        const f = Number(c.fov_deg);
        this.coneFovDeg = Number.isFinite(f) ? Math.max(1, Math.min(360, f)) : 120;
      }      
      if (c.angle_deg !== undefined) {
        this.coneAngleDefault = Number(c.angle_deg) || 0;
        this.coneAngleDeg = this.coneAngleDefault;
      }
    }

    // ensure mins <= maxs
    if (this.xMin > this.xMax) [this.xMin, this.xMax] = [this.xMax, this.xMin];
    if (this.yMin > this.yMax) [this.yMin, this.yMax] = [this.yMax, this.yMin];
    if (this.coneAngleDeg < -180) this.coneAngleDeg = -180;
    if (this.coneAngleDeg > 180) this.coneAngleDeg = 180;
    
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
  }

  processEntityConfig(entityConfig) {
    if (!entityConfig || !Array.isArray(entityConfig)) {
      return [];
    }
    const entityPairs = {};
    entityConfig.forEach(item => {
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
    return Object.values(entityPairs).filter(pair => pair.x && pair.y);
  }

  // build tracked entities from config. Defaults to generator unless direct_entity is true.
  buildTrackedEntities(cfg) {
    if (cfg && cfg.direct_entity) {
      return this.processEntityConfig(cfg.entities);
    }
    const dev = this.devicePrefix;
    const id = this.deviceId;
    const sensor = this.sensorName;
    const count = Number.isFinite(this.targetCount) ? Math.max(0, Math.floor(this.targetCount)) : 0;
    if (dev && id && sensor && count > 0) {
      const pairs = [];
      for (let i = 1; i <= count; i++) {
        const base = `sensor.${dev}_${id}_${sensor}_target_${i}`;
        pairs.push({ x: `${base}_x`, y: `${base}_y` });
      }
      return pairs;
    }
    // Fallback to explicit entities if provided
    return this.processEntityConfig(cfg?.entities);
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; padding: 16px; }
        .container { background: var(--card-background-color); border-radius: var(--ha-card-border-radius); box-shadow: var(--ha-card-box-shadow); padding: 16px; }
        .container.dark { background: #1e1f23; color: #eceff4; }
        .container.dark .canvas-container { border-color: #3a3d45; background: #121316; }
        .canvas-container { position: relative; width: 100%; aspect-ratio: 1; border: 2px solid var(--divider-color); border-radius: 4px; overflow: hidden; background: #fafafa; isolation: isolate; }
        canvas { width: 100%; height: 100%; cursor: crosshair; touch-action: none; }
        .overlay-controls { position: absolute; bottom: 4px; display: flex; gap: 4px; z-index: 1; }
        .overlay-controls-left { left: 4px; flex-direction: column; align-items: flex-start; }
        .overlay-controls-right { right: 4px; }
        .overlay-controls button { width: 30px; height: 30px; padding: 0; background: rgba(0,0,0,0.55); color: #fff; border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; font-size: 11px; line-height: 1; cursor: pointer; backdrop-filter: blur(4px); }
        .container.dark .overlay-controls button { background: rgba(255,255,255,0.18); color: #fff; border-color: rgba(255,255,255,0.35); }
        .overlay-controls button.active { outline: 2px solid #4caf50; }
        .overlay-controls button:disabled { opacity: 0.4; cursor: default; }
        .controls { margin-bottom: 16px; display: flex; gap: 8px; flex-wrap: wrap; }
        #cone-controls { align-items: center; }
        #coneAngleSlider { flex: 1; min-width: 300px; }
        button { padding: 8px 16px; background: var(--primary-color); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
        .container.dark button { background: #2d7dd2; }
        button:hover { opacity: 0.9; }
        button.zone-btn { background: var(--primary-color); }
        button.zone-btn.active { background: var(--accent-color); }
        .info { margin-top: 12px; font-size: 14px; color: var(--secondary-text-color); }
        .container.dark .info { color: #b0b6c2; }
        .container.dark .zone-item { background: #2a2c31; color: #d8dee9; }
        .entity-selection { margin-bottom: 16px; padding: 12px; background: var(--secondary-background-color); border-radius: 4px; }
        .entity-row { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
        .entity-row label { min-width: 20px; font-weight: bold; }
        .entity-row select { flex: 1; padding: 4px 8px; border: 1px solid var(--divider-color); border-radius: 4px; background: var(--card-background-color); color: var(--primary-text-color); }
        .container.dark .entity-row select { background: #202226; border-color: #3a3d45; color: #e5e9f0; }
        .status-indicator { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-left: 4px; }
        .status-indicator.connected { background: var(--success-color, #4caf50); }
        .status-indicator.disconnected { background: var(--error-color, #f44336); }
        .device-title { font-size: 1.2em; font-weight: bold; margin-bottom: 8px; }
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
            <button id="btnLock" title="Lock drawing">🔓</button>
          </div>
        </div>
        <div class="controls" id="zone-buttons">
        </div>
        <div class="controls" id="cone-controls">
          <label for="coneAngleSlider">Cone rotation: </label>
          <input type="range" id="coneAngleSlider" min="-180" max="180" step="1" value="${this.coneAngleDeg}" />
          <span id="coneAngleLabel">${this.coneAngleDeg}°</span>
      </div>
        <div class="info">
          Click & drag for Rect/Ellipse. Polygon: click points, double-click to finish (max ${this.polyMaxPoints} pts). Units mm (X: ${this.xMin}..${this.xMax}, Y: ${this.yMin}..${this.yMax})
        </div>
      </div>
    `;

    this.renderZoneButtons();
    this.setupCanvas();
    this.attachEventListeners();
    if (this._hass) {
      this.updateZonesFromEntities();
    }
  }

  renderZoneButtons() {
    const container = this.shadowRoot.getElementById('zone-buttons');
    container.innerHTML = '';
    this.zoneConfig.forEach(zone => {
      const btn = document.createElement('button');
      btn.className = 'zone-btn';
      btn.dataset.zoneId = zone.id;
      btn.textContent = zone.name;
      btn.addEventListener('click', () => {
        this.shadowRoot.querySelectorAll('.zone-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedZone = zone.id;
      });
      btn.addEventListener('dblclick', (e) => {
        e.preventDefault();
        const zoneId = zone.id;
        // Represent cleared zone by sending shape with null data
        const idx = this.zones.findIndex(z => String(z.id) === String(zoneId));
        if (idx !== -1) this.zones.splice(idx, 1);
        this.updateHomeAssistantShape(zoneId, 'none', null);
        this.drawGrid();
        this.updateZoneList();
        // Clear any in-progress drawing state
        this.isDrawing = false;
        this._polyPoints = [];
        this._cursorPoint = null;
        this.startPoint = null;
        this.drawGrid();
      });
      container.appendChild(btn);
    });

    const clearBtn = document.createElement('button');
    clearBtn.id = 'clearBtn';
    clearBtn.textContent = 'Clear All Zones';
    container.appendChild(clearBtn);

    if (container.querySelector('.zone-btn')) {
      container.querySelector('.zone-btn').click();
    }
  }

  drawCurrentPosition(x, y, color = '#ff6b6b') {
    const ctx = this.ctx;
    const pixelX = this.valueToPixels(x, 'x');
    const pixelY = this.valueToPixels(y, 'y');
    
    if (pixelX >= 0 && pixelX <= this.canvas.width && pixelY >= 0 && pixelY <= this.canvas.height) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pixelX, pixelY, 6, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  attachEventListeners() {
    const zoneButtons = this.shadowRoot.getElementById('zone-buttons');
    zoneButtons.addEventListener('click', (e) => {
      const t = e.target;
      if (!t) return;
      if (t.id === 'clearBtn') {
        this.zones = [];
        this.drawGrid();
        this.updateZoneList();
        this.zoneConfig.forEach(zone => {
          this.updateHomeAssistantShape(zone.id, 'none', null);
        });
        // Clear any in-progress drawing state
        this.isDrawing = false;
        this._polyPoints = [];
        this._cursorPoint = null;
        this.startPoint = null;
        this.drawGrid();
      }
    });

    // Mouse/touch events
    this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
    this.canvas.addEventListener('mousemove', (e) => this.draw(e));
    this.canvas.addEventListener('mouseup', (e) => this.endDrawing(e));
    this.canvas.addEventListener('touchstart', (e) => { e.preventDefault(); this.startDrawing(e); }, { passive: false });
    this.canvas.addEventListener('touchmove', (e) => { e.preventDefault(); this.draw(e); }, { passive: false });
    this.canvas.addEventListener('touchend', (e) => { e.preventDefault(); this.endDrawing(e); }, { passive: false });
    // Finish polygon on double-click
    this.canvas.addEventListener('dblclick', (e) => {
      if (this.drawMode === 'polygon') {
        this.finishPolygon();
      }
    });
    // Keyboard shortcuts for polygon
    this._onKeyDown = (ev) => {
      if (this.drawMode !== 'polygon') return;
      if (ev.key === 'Escape') {
        this._polyPoints = [];
        this.isDrawing = false;
        this.drawGrid();
      } else if (ev.key === 'Backspace') {
        if (this._polyPoints.length > 0) {
          this._polyPoints.pop();
          this.drawGrid();
        }
      }
    };
    window.addEventListener('keydown', this._onKeyDown);

    // Cone rotation slider
    const angleSlider = this.shadowRoot.getElementById('coneAngleSlider');
    const angleLabel = this.shadowRoot.getElementById('coneAngleLabel');
    if (angleSlider && angleLabel) {
      angleSlider.addEventListener('input', () => {
        const val = parseInt(angleSlider.value, 10);
        if (!Number.isNaN(val)) {
          this.coneAngleDeg = Math.max(-180, Math.min(180, val));
          angleLabel.textContent = `${this.coneAngleDeg}°`;
          this.drawGrid();
        }
      });
      // Send rotation to backend when user finishes sliding
      angleSlider.addEventListener('change', () => {
        if (!this._hass) return;
        this._hass.callService('zone_mapper', 'update_zone', {
          location: this.location,
          rotation_deg: this.coneAngleDeg,
        });
      });
      angleSlider.addEventListener('dblclick', () => {
        this.coneAngleDeg = this.coneAngleDefault;
        angleSlider.value = String(this.coneAngleDeg);
        angleLabel.textContent = `${this.coneAngleDeg}°`;
        this.drawGrid();
        if (this._hass) {
          this._hass.callService('zone_mapper', 'update_zone', {
            location: this.location,
            rotation_deg: this.coneAngleDeg,
          });
        }
      });
    }

    // Mode menu and buttons
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
    const overlayButtons = [btnModeRect, btnModeEllipse, btnModePolygon];
    const setMode = (m) => {
      this.drawMode = m;
      this.isDrawing = false; // cancel any existing drawing
      if (m !== 'polygon') this._polyPoints = [];
      this._cursorPoint = null;
      this.startPoint = null;
      overlayButtons.forEach(b => b && b.classList.remove('active'));
      if (m === 'rect' && btnModeRect) btnModeRect.classList.add('active');
      if (m === 'ellipse' && btnModeEllipse) btnModeEllipse.classList.add('active');
      if (m === 'polygon' && btnModePolygon) btnModePolygon.classList.add('active');
      this._updatePolygonButtonsVisibility();
      this.drawGrid();
    };
    if (btnModeRect) btnModeRect.addEventListener('click', () => setMode('rect'));
    if (btnModeEllipse) btnModeEllipse.addEventListener('click', () => setMode('ellipse'));
    if (btnModePolygon) btnModePolygon.addEventListener('click', () => setMode('polygon'));
    if (btnPolyUndo) btnPolyUndo.addEventListener('click', () => {
      if (this.drawMode === 'polygon' && this._polyPoints.length) {
        this._polyPoints.pop();
        this.drawGrid();
      }
    });
    if (btnPolyFinish) btnPolyFinish.addEventListener('click', () => {
      if (this.drawMode === 'polygon') this.finishPolygon();
    });

    if (btnLock) {
      const updateLockVisual = () => {
        btnLock.textContent = this.isLocked ? '🔒' : '🔓';
        btnLock.title = this.isLocked ? 'Unlock drawing' : 'Lock drawing';
        this.canvas.style.cursor = this.isLocked ? 'not-allowed' : 'crosshair';
      };
      btnLock.addEventListener('click', () => {
        this.isLocked = !this.isLocked;
        updateLockVisual();
        // Cancel any in-progress drawing when locking
        if (this.isLocked && this.isDrawing) this.cancelDrawing();
      });
      updateLockVisual();
    }
    // Initialize active mode
    setMode(this.drawMode || 'rect');

    // Cancel drawing if user clicks/touches outside canvas container
    const canvasContainer = this.canvas.parentElement;
    this._outsideClickHandler = (ev) => {
      if (!this.canvas) return;
      // Ignore clicks inside the canvas container (canvas + overlay controls)
      if (canvasContainer && canvasContainer.contains(ev.target)) return;
      if (!this.shadowRoot.contains(ev.target)) return; // outside entire card => ignore (HA might manage)
      if (this.isDrawing) this.cancelDrawing();
    };
    document.addEventListener('mousedown', this._outsideClickHandler, true);
    document.addEventListener('touchstart', this._outsideClickHandler, true);
    // Cancel if pointer leaves canvas bounds
    if (canvasContainer) {
      canvasContainer.addEventListener('mouseleave', () => {
        if (this.isDrawing) this.cancelDrawing();
      });
    }
  }

  endDrawing(e) {
    if (!this.isDrawing) return;
    const isTouch = !!(e.changedTouches || e.touches);
    if (this._activeInput && ((isTouch && this._activeInput !== 'touch') || (!isTouch && this._activeInput !== 'mouse'))) {
      return;
    }
    if (this.drawMode === 'polygon') {
      // Add a vertex on each mouse/touch end
      const p = this._getPointFromEvent(e);
      const vx = this.pixelsToValue(p.x, 'x');
      const vy = this.pixelsToValue(p.y, 'y');
      if (this._polyPoints.length < this.polyMaxPoints) {
        this._polyPoints.push({ x: vx, y: vy });
        // Auto-finish if we hit max and have at least 3 points
        if (this._polyPoints.length === this.polyMaxPoints && this._polyPoints.length >= 3) {
          this.finishPolygon();
          return;
        }
        // Double-tap / double-click detection for finishing polygon on mobile
        const now = Date.now();
        if (this._lastPolyTap && (now - this._lastPolyTap) < 350) {
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
    const endPoint = this._getPointFromEvent(e);
    const zone = this.zones.find(z => z.id === this.selectedZone);
    // Convert drawn zones to mm
    let payload = null;
    if (this.drawMode === 'rect') {
      const x_min = Math.min(
        this.pixelsToValue(this.startPoint.x, 'x'),
        this.pixelsToValue(endPoint.x, 'x')
      );
      const x_max = Math.max(
        this.pixelsToValue(this.startPoint.x, 'x'),
        this.pixelsToValue(endPoint.x, 'x')
      );
      const y_min = Math.min(
        this.pixelsToValue(this.startPoint.y, 'y'),
        this.pixelsToValue(endPoint.y, 'y')
      );
      const y_max = Math.max(
        this.pixelsToValue(this.startPoint.y, 'y'),
        this.pixelsToValue(endPoint.y, 'y')
      );
      payload = { shape: 'rect', data: {
        x_min: Math.max(this.xMin, Math.min(this.xMax, x_min)),
        x_max: Math.max(this.xMin, Math.min(this.xMax, x_max)),
        y_min: Math.max(this.yMin, Math.min(this.yMax, y_min)),
        y_max: Math.max(this.yMin, Math.min(this.yMax, y_max)),
      }};
    } else if (this.drawMode === 'ellipse') {
      // Bounding box -> ellipse center/radii
      const x1 = this.pixelsToValue(this.startPoint.x, 'x');
      const y1 = this.pixelsToValue(this.startPoint.y, 'y');
      const x2 = this.pixelsToValue(endPoint.x, 'x');
      const y2 = this.pixelsToValue(endPoint.y, 'y');
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      payload = { shape: 'ellipse', data: { cx, cy, rx, ry } };
    } else if (this.drawMode === 'polygon') {
      // polygon finalization is handled by dblclick -> finishPolygon()
    }

    if (!payload) return;
    const newZone = { id: this.selectedZone, ...payload.data, shape: payload.shape };

    if (zone) {
      Object.assign(zone, newZone);
    } else {
      this.zones.push(newZone);
    }
    this.drawGrid();
    this.updateZoneList();
    this.updateHomeAssistantShape(this.selectedZone, payload.shape, payload.data);
  }

  _getPointFromEvent(e) {
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
    this._hass.callService('zone_mapper', 'update_zone', {
      location: this.location,
      zone_id: zoneId,
      shape,
      data,
      entities: this.trackedEntities.filter(p => p.x && p.y)
    });
  }

  updateZoneList() {
    this.zones.forEach(zone => {
      const item = document.createElement('div');
      item.className = 'zone-item';
      if (zone.shape === 'rect') {
        item.textContent = `Zone ${zone.id} [rect]: (${zone.x_min.toFixed(0)} mm, ${zone.y_min.toFixed(0)} mm)  (${zone.x_max.toFixed(0)} mm, ${zone.y_max.toFixed(0)} mm)`;
      } else if (zone.shape === 'ellipse') {
        item.textContent = `Zone ${zone.id} [ellipse]: center=(${zone.cx.toFixed(0)}, ${zone.cy.toFixed(0)}) r=(${zone.rx.toFixed(0)}, ${zone.ry.toFixed(0)})`;
      } else if (zone.shape === 'polygon') {
        const n = Array.isArray(zone.points) ? zone.points.length : 0;
        item.textContent = `Zone ${zone.id} [polygon]: ${n} pts`;
      }
    });
  }

  updateZonesFromEntities() {
    if (!this._hass) return;
    const sanitizedDevice = this.location.toLowerCase().replace(/\s+/g, '_');
    this.zoneConfig.forEach(zoneConf => {
      const entityId = `sensor.zone_mapper_${sanitizedDevice}_zone_${zoneConf.id}`;
      const state = this._hass.states[entityId];
      if (state && state.attributes) {
        if ('shape' in state.attributes) {
          const shape = state.attributes.shape;
          const data = state.attributes.data;
            if (data) {
              const z = { id: zoneConf.id, shape, ...data };
              const existingZone = this.zones.find(zz => zz.id === zoneConf.id);
              if (existingZone) Object.assign(existingZone, z); else this.zones.push(z);
            }
        }
        // restore rotation if available
        if (typeof state.attributes.rotation_deg === 'number') {
          this.coneAngleDeg = Math.max(-180, Math.min(180, Math.round(state.attributes.rotation_deg)));
          const angleSlider = this.shadowRoot.getElementById('coneAngleSlider');
          const angleLabel = this.shadowRoot.getElementById('coneAngleLabel');
          if (angleSlider) angleSlider.value = String(this.coneAngleDeg);
          if (angleLabel) angleLabel.textContent = `${this.coneAngleDeg}°`;
        }
      }
    });
    this.drawGrid();
    this.updateZoneList();
  }

  finishPolygon() {
    if (this._polyPoints.length >= 3 && this.selectedZone !== null) {
      // Enforce max points on commit
      if (this._polyPoints.length > this.polyMaxPoints) {
        this._polyPoints = this._polyPoints.slice(0, this.polyMaxPoints);
      }
      const payload = { shape: 'polygon', data: { points: this._polyPoints.slice(0, this.polyMaxPoints) } };
      const newZone = { id: this.selectedZone, ...payload.data, shape: payload.shape };
      const zone = this.zones.find(z => z.id === this.selectedZone);
      if (zone) Object.assign(zone, newZone); else this.zones.push(newZone);
      this.updateHomeAssistantShape(this.selectedZone, payload.shape, payload.data);
    }
    this._polyPoints = [];
    this.isDrawing = false;
    this._cursorPoint = null;
    this.startPoint = null;
    this.drawGrid();
    this.updateZoneList();
  }
  
  drawGrid() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = this.xMin; x <= this.xMax; x += 1000) {
      const pixelX = this.valueToPixels(x, 'x');
      ctx.moveTo(pixelX, 0);
      ctx.lineTo(pixelX, this.canvas.height);
    }
    for (let y = this.yMin; y <= this.yMax; y += 1000) {
      const pixelY = this.valueToPixels(y, 'y');
      ctx.moveTo(0, pixelY);
      ctx.lineTo(this.canvas.width, pixelY);
    }
    ctx.stroke();
    ctx.closePath();

    const originColor = this.darkMode ? '#ffffff' : '#000000';
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

    this.drawDeviceCone();

    this.drawZones();
    this._drawInProgress();
    
    // Draw current tracked targets
    if (this._hass) {
      const colors = ['#f44336', '#2196f3', '#4caf50', '#ffc107', '#9c27b0'];
      const theta = (this.coneAngleDeg || 0) * Math.PI / 180;
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      const rotatePoint = (x, y) => ({ x: x * c + y * s, y: -x * s + y * c });
      this.trackedEntities.forEach((pair, idx) => {
        if (pair.x && pair.y && this._hass.states[pair.x] && this._hass.states[pair.y]) {
          const xVal = parseFloat(this._hass.states[pair.x].state);
          const yVal = parseFloat(this._hass.states[pair.y].state);
          if (!isNaN(xVal) && !isNaN(yVal)) {
            const rot = rotatePoint(xVal, yVal);
            this.drawCurrentPosition(rot.x, rot.y, colors[idx % colors.length]);
          }
        }
      });
    }
  }
  
  drawZones() {
    const ctx = this.ctx;
    const colors = [
      'rgba(244, 67, 54, 0.30)',
      'rgba(33, 150, 243, 0.30)',
      'rgba(76, 175, 80, 0.30)',
      'rgba(255, 193, 7, 0.30)',
      'rgba(156, 39, 176, 0.30)'
    ];
    this.zones.forEach((zone, idx) => {
      const color = colors[(Number(zone.id) - 1) % colors.length] || colors[idx % colors.length];
      ctx.strokeStyle = color.replace('0.30', '1');
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      let bbox = null; // {x,y,width,height}
      if (zone.shape === 'rect') {
        const x1 = this.valueToPixels(zone.x_min, 'x');
        const y1 = this.valueToPixels(zone.y_min, 'y');
        const x2 = this.valueToPixels(zone.x_max, 'x');
        const y2 = this.valueToPixels(zone.y_max, 'y');
        const x = Math.min(x1, x2);
        const y = Math.min(y1, y2);
        const width = Math.abs(x2 - x1);
        const height = Math.abs(y2 - y1);
        ctx.fillRect(x, y, width, height);
        ctx.strokeRect(x, y, width, height);
        bbox = { x, y, width, height };
      } else if (zone.shape === 'ellipse') {
        const cx = this.valueToPixels(zone.cx, 'x');
        const cy = this.valueToPixels(zone.cy, 'y');
        const rx = Math.abs(this.valueToPixels(zone.cx + zone.rx, 'x') - this.valueToPixels(zone.cx, 'x'));
        const ry = Math.abs(this.valueToPixels(zone.cy + zone.ry, 'y') - this.valueToPixels(zone.cy, 'y'));
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        bbox = { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 };
      } else if (zone.shape === 'polygon' && Array.isArray(zone.points)) {
        const pts = zone.points.map(p => ({ x: this.valueToPixels(p.x, 'x'), y: this.valueToPixels(p.y, 'y') }));
        if (pts.length >= 3) {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          // Compute bounding box
          let minX = pts[0].x, minY = pts[0].y, maxX = pts[0].x, maxY = pts[0].y;
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
    if (this.drawMode === 'polygon' && this.isDrawing) {
      const pts = (this._polyPoints || []).map(p => ({ x: this.valueToPixels(p.x, 'x'), y: this.valueToPixels(p.y, 'y') }));
      if (pts.length >= 2) {
        ctx.save();
        ctx.strokeStyle = this.darkMode ? 'rgba(255,255,255,0.85)' : 'rgba(33,33,33,0.85)';
        ctx.lineWidth = 2;
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
        const previewColor = this.darkMode ? 'rgba(255,255,255,0.75)' : 'rgba(100,100,100,0.75)';
        ctx.save();
        ctx.strokeStyle = previewColor;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        const anchor = pts.length ? pts[pts.length - 1] : { x: this.startPoint?.x ?? null, y: this.startPoint?.y ?? null };
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
      const fill = this.darkMode ? '#ffffff' : '#000000';
      const stroke = this.darkMode ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)';
      for (const pt of pts) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }

      if (!pts.length && this.startPoint) {
        ctx.beginPath();
        ctx.arc(this.startPoint.x, this.startPoint.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }
      ctx.restore();
    } 
    
    else if (this.isDrawing && this.startPoint && (this.drawMode === 'rect' || this.drawMode === 'ellipse')) {
      const pt = this.startPoint;
      ctx.save();
      const fill = this.darkMode ? '#ffffff' : '#000000';
      const stroke = this.darkMode ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = stroke;
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawZoneLabel(zone, bbox) {
    const ctx = this.ctx;
    const zoneConf = this.zoneConfig.find(zc => String(zc.id) === String(zone.id));
    if (!zoneConf) return;
    const label = zoneConf.name || `Zone ${zone.id}`;
    ctx.save();
    ctx.font = '12px sans-serif';
    ctx.fillStyle = this.darkMode ? '#ffffff' : '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = this.darkMode ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)';
    ctx.shadowBlur = 2;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Shape center; polygons use centroid, others use bbox center
    let cx = bbox.x + bbox.width / 2;
    let cy = bbox.y + bbox.height / 2;
    if (zone.shape === 'polygon' && Array.isArray(zone.points) && zone.points.length >= 3) {
      let A = 0, Cx = 0, Cy = 0;
      for (let i = 0, j = zone.points.length - 1; i < zone.points.length; j = i++) {
        const xi = this.valueToPixels(zone.points[i].x, 'x');
        const yi = this.valueToPixels(zone.points[i].y, 'y');
        const xj = this.valueToPixels(zone.points[j].x, 'x');
        const yj = this.valueToPixels(zone.points[j].y, 'y');
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

  drawDeviceCone() {
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
      const tmp = thetaStart; thetaStart = thetaEnd; thetaEnd = tmp;
    }

    const radius = Math.max(0, this.coneYMax);
    const ax = this.valueToPixels(apex.x, 'x');
    const ay = this.valueToPixels(apex.y, 'y');

    // Point on arc at angle ang on circle with radius
    const pAt = (ang) => ({ x: radius * Math.sin(ang), y: radius * Math.cos(ang) });
    const L = pAt(thetaStart);
    const R = pAt(thetaEnd);
    const lx = this.valueToPixels(L.x, 'x');
    const ly = this.valueToPixels(L.y, 'y');

    // Build filled sector: apex -> left ray -> arc -> right ray -> apex
    const segments = 48;
    const step = (thetaEnd - thetaStart) / segments;

    ctx.save();
    ctx.fillStyle = 'rgba(128, 233, 31, 0.06)';
    ctx.strokeStyle = 'rgba(117, 243, 33, 0.6)';
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
  }
  
  setupCanvas() {
    this.canvas = this.shadowRoot.getElementById('zoneCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = 400;
    this.canvas.height = 400;
    this.pxPerX = this.canvas.width / (this.xMax - this.xMin);
    this.pxPerY = this.canvas.height / (this.yMax - this.yMin);
    this.drawGrid();
  }

  startDrawing(e) {
    if (this.isLocked) return;
    if (this.selectedZone === null) return;
    this.isDrawing = true;
    this._activeInput = e.touches ? 'touch' : 'mouse';
    this.startPoint = this._getPointFromEvent(e);
    this._cursorPoint = this.startPoint;
    this.drawGrid();
  }

  draw(e) {
    if (this.isLocked || !this.isDrawing) return;
    const isTouch = !!(e.touches || e.changedTouches);
    if (this._activeInput && ((isTouch && this._activeInput !== 'touch') || (!isTouch && this._activeInput !== 'mouse'))) {
      return;
    }
    const currentPoint = this._getPointFromEvent(e);
    // polygon cache cursor point
    if (this.drawMode === 'polygon') {
      this._cursorPoint = currentPoint;
      this.drawGrid();
      return;
    }
    this.drawGrid();
    const ctx = this.ctx;
    ctx.strokeStyle = this.darkMode ? 'rgba(255,255,255,0.75)' : 'rgba(100, 100, 100, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    const width = currentPoint.x - this.startPoint.x;
    const height = currentPoint.y - this.startPoint.y;
    if (this.drawMode === 'rect') {
      ctx.strokeRect(this.startPoint.x, this.startPoint.y, width, height);
    } else if (this.drawMode === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(
        this.startPoint.x + width / 2,
        this.startPoint.y + height / 2,
        Math.abs(width) / 2,
        Math.abs(height) / 2,
        0, 0, Math.PI * 2
      );
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  valueToPixels(val, axis) {
    if (axis === 'x') {
      return (val - this.xMin) * this.pxPerX;
    } else {
      // Y increases downward: map directly without flipping
      return (val - this.yMin) * this.pxPerY;
    }
  }

  pixelsToValue(pix, axis) {
    if (axis === 'x') {
      return pix / this.pxPerX + this.xMin;
    } else {
      // Inverse of valueToPixels when Y increases downward
      return this.yMin + pix / this.pxPerY;
    }
  }

  getCardSize() {
    return 8;
  }

  _updatePolygonButtonsVisibility() {
    const undo = this.shadowRoot.getElementById('btnPolyUndo');
    const fin = this.shadowRoot.getElementById('btnPolyFinish');
    const show = this.drawMode === 'polygon';
    [undo, fin].forEach(btn => {
      if (!btn) return;
      btn.style.display = show ? 'block' : 'none';
    });
  }

  cancelDrawing() {
    this.isDrawing = false;
    if (this.drawMode === 'polygon') this._polyPoints = [];
    this._cursorPoint = null;
    this.startPoint = null;
    this.drawGrid();
  }

  disconnectedCallback() {
    window.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('mousedown', this._outsideClickHandler, true);
    document.removeEventListener('touchstart', this._outsideClickHandler, true);
    if (this._canvasResizeObserver) this._canvasResizeObserver.disconnect();
  }
}

customElements.define('zone-mapper-card', ZoneMapperCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'zone-mapper-card',
  name: 'Zone Mapper Card',
  description: 'Draw and manage detection zones for devices'
});