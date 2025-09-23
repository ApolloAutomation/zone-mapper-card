class ZoneMapperCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.zones = [];
    this.selectedZone = null;
    this.isDrawing = false;
    this.startPoint = null;
    this.entitiesPopulated = false;
    this.trackedEntities = [];

    // Default card grid ranges in millimeters
    this.xMin = -5000;
    this.xMax = 5000;
    this.yMin = 0;
    this.yMax = 10000;
  }

  // Default stub config
  static getStubConfig() {
    return {
      type: 'custom:zone-mapper-card',
      device: 'office',
      zones: [
        { id: 1, name: 'Zone 1' },
        { id: 2, name: 'Zone 2' },
        { id: 3, name: 'Zone 3' },
      ],
      entities: [
        { x1: 'sensor.device_target_1_x' },
        { y1: 'sensor.device_target_1_y' },
        { x2: 'sensor.device_target_2_x' },
        { y2: 'sensor.device_target_2_y' },
      ],
    };
  }

  setConfig(config) {
    if (!config.device) {
      throw new Error("You must specify a device name.");
    }
    if (!config.zones || !Array.isArray(config.zones)) {
      throw new Error("You must specify a list of zones.");
    }

    this.config = config;
    this.device = config.device;
    this.zoneConfig = config.zones;
    this.trackedEntities = this.processEntityConfig(config.entities);

    // Allow overriding ranges
    if (config.x_min_mm !== undefined) this.xMin = config.x_min_mm;
    if (config.x_max_mm !== undefined) this.xMax = config.x_max_mm;
    if (config.y_min_mm !== undefined) this.yMin = config.y_min_mm;
    if (config.y_max_mm !== undefined) this.yMax = config.y_max_mm;
    
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

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        /* Styles omitted for brevity, they are mostly unchanged */
        :host { display: block; padding: 16px; }
        .container { background: var(--card-background-color); border-radius: var(--ha-card-border-radius); box-shadow: var(--ha-card-box-shadow); padding: 16px; }
        .canvas-container { position: relative; width: 100%; aspect-ratio: 1; border: 2px solid var(--divider-color); border-radius: 4px; overflow: hidden; background: #fafafa; }
  canvas { width: 100%; height: 100%; cursor: crosshair; touch-action: none; }
        .controls { margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap; }
        button { padding: 8px 16px; background: var(--primary-color); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
        button:hover { opacity: 0.9; }
        button.zone-btn { background: var(--primary-color); }
        button.zone-btn.active { background: var(--accent-color); }
        .info { margin-top: 12px; font-size: 14px; color: var(--secondary-text-color); }
        .zone-list { margin-top: 12px; }
        .zone-item { padding: 8px; margin: 4px 0; background: var(--secondary-background-color); border-radius: 4px; font-size: 14px; }
        .entity-selection { margin-bottom: 16px; padding: 12px; background: var(--secondary-background-color); border-radius: 4px; }
        .entity-row { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
        .entity-row label { min-width: 20px; font-weight: bold; }
        .entity-row select { flex: 1; padding: 4px 8px; border: 1px solid var(--divider-color); border-radius: 4px; background: var(--card-background-color); color: var(--primary-text-color); }
        .status-indicator { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-left: 4px; }
        .status-indicator.connected { background: var(--success-color, #4caf50); }
        .status-indicator.disconnected { background: var(--error-color, #f44336); }
        .device-title { font-size: 1.2em; font-weight: bold; margin-bottom: 8px; }
      </style>
      <div class="container">
        <div class="device-title">Device: ${this.device}</div>
        <div class="canvas-container">
          <canvas id="zoneCanvas"></canvas>
        </div>
        <div class="controls" id="zone-buttons">
        </div>
        <div class="info">
          Click and drag to draw a zone. Units: mm (X: ${this.xMin}..${this.xMax}, Y: ${this.yMin}..${this.yMax})
        </div>
        <div class="zone-list" id="zoneList"></div>
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
        if (e.target.id === 'clearBtn') {
            this.zones = [];
            this.drawGrid();
            this.updateZoneList();
            this.zoneConfig.forEach(zone => {
                this.updateHomeAssistant(zone.id, 0, 0, 0, 0);
            });
        }
    });

    // Mouse/touch events
    this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
    this.canvas.addEventListener('mousemove', (e) => this.draw(e));
    this.canvas.addEventListener('mouseup', (e) => this.endDrawing(e));
    this.canvas.addEventListener('touchstart', (e) => { e.preventDefault(); this.startDrawing(e); }, { passive: false });
    this.canvas.addEventListener('touchmove', (e) => { e.preventDefault(); this.draw(e); }, { passive: false });
    this.canvas.addEventListener('touchend', (e) => { e.preventDefault(); this.endDrawing(e); }, { passive: false });
  }

  endDrawing(e) {
    if (!this.isDrawing) return;
    const isTouch = !!(e.changedTouches || e.touches);
    if (this._activeInput && ((isTouch && this._activeInput !== 'touch') || (!isTouch && this._activeInput !== 'mouse'))) {
      return;
    }
    this.isDrawing = false;
    const endPoint = this._getPointFromEvent(e);
    const zone = this.zones.find(z => z.id === this.selectedZone);
    // Convert drawn zones to mm
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
    const newZone = {
      id: this.selectedZone,
      x_min: Math.max(this.xMin, Math.min(this.xMax, x_min)),
      x_max: Math.max(this.xMin, Math.min(this.xMax, x_max)),
      y_min: Math.max(this.yMin, Math.min(this.yMax, y_min)),
      y_max: Math.max(this.yMin, Math.min(this.yMax, y_max))
    };

    if (zone) {
      Object.assign(zone, newZone);
    } else {
      this.zones.push(newZone);
    }
    this.drawGrid();
    this.updateZoneList();
    this.updateHomeAssistant(
      this.selectedZone,
      newZone.x_min,
      newZone.x_max,
      newZone.y_min,
      newZone.y_max
    );
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

  updateHomeAssistant(zoneId, x_min, x_max, y_min, y_max) {
    if (!this._hass) return;
    this._hass.callService('zone_mapper', 'update_zone', {
      device: this.device,
      zone_id: zoneId,
      x_min,
      x_max,
      y_min,
      y_max,
      entities: this.trackedEntities.filter(p => p.x && p.y)
    });
  }

  updateZoneList() {
    const list = this.shadowRoot.getElementById('zoneList');
    list.innerHTML = '';
    this.zones.forEach(zone => {
      const item = document.createElement('div');
      item.className = 'zone-item';
      item.textContent = `Zone ${zone.id}: (${zone.x_min.toFixed(0)} mm, ${zone.y_min.toFixed(0)} mm)  (${zone.x_max.toFixed(0)} mm, ${zone.y_max.toFixed(0)} mm)`;
      list.appendChild(item);
    });
  }

  updateZonesFromEntities() {
    if (!this._hass) return;
    const sanitizedDevice = this.device.toLowerCase().replace(/\s+/g, '_');
    this.zoneConfig.forEach(zoneConf => {
      const entityId = `sensor.zone_mapper_${sanitizedDevice}_zone_${zoneConf.id}_coords`;
      const state = this._hass.states[entityId];
      if (state && state.attributes) {
        const { x_min, x_max, y_min, y_max } = state.attributes;
        if (
          x_min !== undefined && x_max !== undefined &&
          y_min !== undefined && y_max !== undefined &&
          (x_min !== 0 || x_max !== 0 || y_min !== 0 || y_max !== 0)
        ) {
          const existingZone = this.zones.find(z => z.id === zoneConf.id);
          const newZone = { id: zoneConf.id, x_min, x_max, y_min, y_max };
          if (existingZone) {
            Object.assign(existingZone, newZone);
          } else {
            this.zones.push(newZone);
          }
        }
      }
    });
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

    ctx.strokeStyle = '#9e9e9e';
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

    ctx.fillStyle = '#424242';
    ctx.beginPath();
    ctx.arc(x0, y0, 3, 0, Math.PI * 2);
    ctx.fill();

    this.drawDeviceCone();

    this.drawZones();
    
    // Draw current tracked targets
    if (this._hass) {
      const colors = ['#f44336', '#2196f3', '#4caf50', '#ffc107', '#9c27b0'];
      this.trackedEntities.forEach((pair, idx) => {
        if (pair.x && pair.y && this._hass.states[pair.x] && this._hass.states[pair.y]) {
          const xVal = parseFloat(this._hass.states[pair.x].state);
          const yVal = parseFloat(this._hass.states[pair.y].state);
          if (!isNaN(xVal) && !isNaN(yVal)) {
            this.drawCurrentPosition(xVal, yVal, colors[idx % colors.length]);
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
      const x1 = this.valueToPixels(zone.x_min, 'x');
      const y1 = this.valueToPixels(zone.y_min, 'y');
      const x2 = this.valueToPixels(zone.x_max, 'x');
      const y2 = this.valueToPixels(zone.y_max, 'y');
      const x = Math.min(x1, x2);
      const y = Math.min(y1, y2);
      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);

      const color = colors[(Number(zone.id) - 1) % colors.length] || colors[idx % colors.length];
      ctx.fillStyle = color;
      ctx.strokeStyle = color.replace('0.30', '1');
      ctx.lineWidth = 2;
      ctx.fillRect(x, y, width, height);
      ctx.strokeRect(x, y, width, height);

      const zoneConf = this.zoneConfig.find(zc => String(zc.id) === String(zone.id));
      if (zoneConf && width > 20 && height > 14) {
        const label = zoneConf.name || `Zone ${zone.id}`;
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#212121';
        const metrics = ctx.measureText(label);
        const padX = 4, padY = 2, h = 14, w = metrics.width + padX * 2;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(x + 2, y + 2, w, h);
        ctx.fillStyle = '#212121';
        ctx.fillText(label, x + 2 + padX, y + 2 + 11);
      }
    });
  }

  drawDeviceCone() {
    const ctx = this.ctx;
    const apex = { x: 0, y: 0 };
    const left = { x: -3000, y: 6000 };
    const right = { x: 3000, y: 6000 };
    const ax = this.valueToPixels(apex.x, 'x');
    const ay = this.valueToPixels(apex.y, 'y');
    const lx = this.valueToPixels(left.x, 'x');
    const ly = this.valueToPixels(left.y, 'y');
    const rx = this.valueToPixels(right.x, 'x');
    const ry = this.valueToPixels(right.y, 'y');

    ctx.save();
    ctx.fillStyle = 'rgba(128, 233, 31, 0.06)';
    ctx.strokeStyle = 'rgba(117, 243, 33, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(lx, ly);
    ctx.lineTo(rx, ry);
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
    if (this.selectedZone === null) return;
    this.isDrawing = true;
    this._activeInput = e.touches ? 'touch' : 'mouse';
    this.startPoint = this._getPointFromEvent(e);
  }

  draw(e) {
    if (!this.isDrawing) return;
    const isTouch = !!(e.touches || e.changedTouches);
    if (this._activeInput && ((isTouch && this._activeInput !== 'touch') || (!isTouch && this._activeInput !== 'mouse'))) {
      return;
    }
    const currentPoint = this._getPointFromEvent(e);
    this.drawGrid();
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    const width = currentPoint.x - this.startPoint.x;
    const height = currentPoint.y - this.startPoint.y;
    ctx.strokeRect(this.startPoint.x, this.startPoint.y, width, height);
    ctx.setLineDash([]);
  }

  valueToPixels(val, axis) {
    if (axis === 'x') {
      return (val - this.xMin) * this.pxPerX;
    } else {
      return this.canvas.height - (val - this.yMin) * this.pxPerY;
    }
  }

  pixelsToValue(pix, axis) {
    if (axis === 'x') {
      return pix / this.pxPerX + this.xMin;
    } else {
      return this.yMin + (this.canvas.height - pix) / this.pxPerY;
    }
  }

  getCardSize() {
    return 8;
  }
}

customElements.define('zone-mapper-card', ZoneMapperCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'zone-mapper-card',
  name: 'Zone Mapper Card',
  description: 'Draw and manage detection zones for devices'
});