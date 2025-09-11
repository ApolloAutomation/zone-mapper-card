class ZoneMapperCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.zones = [];
    this.selectedZone = null;
    this.isDrawing = false;
    this.startPoint = null;
  }

  setConfig(config) {
    this.config = config;
    this.maxZones = config.max_zones || 3;
    this.gridSize = config.grid_size || 12; // -6 to 6 meters
    this.xEntity = config.x_entity || "";
    this.yEntity = config.y_entity || "";
    this.render();
  }

  set hass(hass) {
    this._hass = hass;
    this.populateEntityDropdowns();
    this.updateEntityStatus();
    this.updateZonesFromEntities();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 16px;
        }
        .container {
          position: relative;
          background: var(--card-background-color);
          border-radius: var(--ha-card-border-radius);
          box-shadow: var(--ha-card-box-shadow);
          padding: 16px;
        }
        .canvas-container {
          position: relative;
          width: 100%;
          aspect-ratio: 1;
          border: 2px solid var(--divider-color);
          border-radius: 4px;
          overflow: hidden;
          background: #fafafa;
        }
        canvas {
          width: 100%;
          height: 100%;
          cursor: crosshair;
        }
        .controls {
          margin-top: 16px;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        button {
          padding: 8px 16px;
          background: var(--primary-color);
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }
        button:hover {
          opacity: 0.9;
        }
        button.zone-btn {
          background: var(--primary-color);
        }
        button.zone-btn.active {
          background: var(--accent-color);
        }
        .info {
          margin-top: 12px;
          font-size: 14px;
          color: var(--secondary-text-color);
        }
        .zone-list {
          margin-top: 12px;
        }
        .zone-item {
          padding: 8px;
          margin: 4px 0;
          background: var(--secondary-background-color);
          border-radius: 4px;
          font-size: 14px;
        }
        .entity-selection {
          margin-bottom: 16px;
          padding: 12px;
          background: var(--secondary-background-color);
          border-radius: 4px;
        }
        .entity-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 8px 0;
        }
        .entity-row label {
          min-width: 80px;
          font-weight: bold;
        }
        .entity-row select {
          flex: 1;
          padding: 4px 8px;
          border: 1px solid var(--divider-color);
          border-radius: 4px;
          background: var(--card-background-color);
          color: var(--primary-text-color);
        }
        .status-indicator {
          display: inline-block;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          margin-left: 8px;
        }
        .status-indicator.connected {
          background: var(--success-color, #4caf50);
        }
        .status-indicator.disconnected {
          background: var(--error-color, #f44336);
        }
      </style>
      <div class="container">
        <div class="entity-selection">
          <h3>Entity Selection</h3>
          <div class="entity-row">
            <label>X Entity:</label>
            <select id="xEntitySelect">
              <option value="">Select X coordinate entity...</option>
            </select>
            <span class="status-indicator disconnected" id="xStatus"></span>
          </div>
          <div class="entity-row">
            <label>Y Entity:</label>
            <select id="yEntitySelect">
              <option value="">Select Y coordinate entity...</option>
            </select>
            <span class="status-indicator disconnected" id="yStatus"></span>
          </div>
          <div class="entity-row">
            <button id="setEntitiesBtn">Set Entities</button>
            <span id="currentPosition"></span>
          </div>
        </div>
        <div class="canvas-container">
          <canvas id="zoneCanvas"></canvas>
        </div>
        <div class="controls">
          <button id="zone1" class="zone-btn" data-zone="0">Zone 1</button>
          <button id="zone2" class="zone-btn" data-zone="1">Zone 2</button>
          <button id="zone3" class="zone-btn" data-zone="2">Zone 3</button>
          <button id="clearBtn">Clear All</button>
        </div>
        <div class="info">
          Click and drag to draw a zone. Grid: -6m to 6m
        </div>
        <div class="zone-list" id="zoneList"></div>
      </div>
    `;

    this.setupCanvas();
    this.populateEntityDropdowns();
    this.attachEventListeners();
  }

  setupCanvas() {
    this.canvas = this.shadowRoot.getElementById('zoneCanvas');
    this.ctx = this.canvas.getContext('2d');

    // Set canvas size
    const container = this.canvas.parentElement;
    const rect = container.getBoundingClientRect();
    this.canvas.width = 400;
    this.canvas.height = 400;

    this.pixelsPerMeter = this.canvas.width / this.gridSize;
    this.drawGrid();
  }

  drawGrid() {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;

    // Vertical lines
    for (let i = 0; i <= this.gridSize; i++) {
      const x = (i / this.gridSize) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Horizontal lines
    for (let i = 0; i <= this.gridSize; i++) {
      const y = (i / this.gridSize) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw axes
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;

    // X-axis (center)
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Y-axis (center)
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.stroke();

    // Draw origin
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 3, 0, 2 * Math.PI);
    ctx.fill();

    // Redraw zones
    this.drawZones();
    
    // Redraw current position if available
    this.updateEntityStatus();
  }

  drawZones() {
    const colors = ['rgba(255, 0, 0, 0.3)', 'rgba(0, 255, 0, 0.3)', 'rgba(0, 0, 255, 0.3)'];

    this.zones.forEach((zone, index) => {
      if (zone) {
        const ctx = this.ctx;
        ctx.fillStyle = colors[index];
        ctx.strokeStyle = colors[index].replace('0.3', '1');
        ctx.lineWidth = 2;

        const x = this.metersToPixels(zone.x_min, 'x');
        const y = this.metersToPixels(zone.y_min, 'y');
        const width = this.metersToPixels(zone.x_max, 'x') - x;
        const height = this.metersToPixels(zone.y_max, 'y') - y;

        ctx.fillRect(x, y, width, height);
        ctx.strokeRect(x, y, width, height);
      }
    });
  }

  metersToPixels(meters, axis) {
    const center = this.canvas.width / 2;
    if (axis === 'x') {
      return center + (meters * this.pixelsPerMeter);
    } else {
      return center - (meters * this.pixelsPerMeter); // Invert Y axis
    }
  }

  pixelsToMeters(pixels, axis) {
    const center = this.canvas.width / 2;
    if (axis === 'x') {
      return (pixels - center) / this.pixelsPerMeter;
    } else {
      return -(pixels - center) / this.pixelsPerMeter; // Invert Y axis
    }
  }

  populateEntityDropdowns() {
    if (!this._hass) return;

    const xSelect = this.shadowRoot.getElementById('xEntitySelect');
    const ySelect = this.shadowRoot.getElementById('yEntitySelect');
    
    // Clear existing options (except first one)
    xSelect.innerHTML = '<option value="">Select X coordinate entity...</option>';
    ySelect.innerHTML = '<option value="">Select Y coordinate entity...</option>';
    
    // Get all sensor entities
    Object.keys(this._hass.states).forEach(entityId => {
      const state = this._hass.states[entityId];
      if (entityId.startsWith('sensor.') && !isNaN(parseFloat(state.state))) {
        const option = document.createElement('option');
        option.value = entityId;
        option.textContent = state.attributes.friendly_name || entityId;
        
        // Add to both dropdowns
        xSelect.appendChild(option.cloneNode(true));
        ySelect.appendChild(option);
      }
    });
    
    // Set previously selected entities
    if (this.xEntity) xSelect.value = this.xEntity;
    if (this.yEntity) ySelect.value = this.yEntity;
    
    this.updateEntityStatus();
  }

  updateEntityStatus() {
    if (!this._hass) return;

    const xStatus = this.shadowRoot.getElementById('xStatus');
    const yStatus = this.shadowRoot.getElementById('yStatus');
    const currentPos = this.shadowRoot.getElementById('currentPosition');
    
    const xEntity = this.shadowRoot.getElementById('xEntitySelect').value;
    const yEntity = this.shadowRoot.getElementById('yEntitySelect').value;
    
    // Update status indicators
    if (xEntity && this._hass.states[xEntity] && this._hass.states[xEntity].state !== 'unavailable') {
      xStatus.className = 'status-indicator connected';
    } else {
      xStatus.className = 'status-indicator disconnected';
    }
    
    if (yEntity && this._hass.states[yEntity] && this._hass.states[yEntity].state !== 'unavailable') {
      yStatus.className = 'status-indicator connected';
    } else {
      yStatus.className = 'status-indicator disconnected';
    }
    
    // Update current position display
    if (xEntity && yEntity && this._hass.states[xEntity] && this._hass.states[yEntity]) {
      const xVal = parseFloat(this._hass.states[xEntity].state);
      const yVal = parseFloat(this._hass.states[yEntity].state);
      if (!isNaN(xVal) && !isNaN(yVal)) {
        currentPos.textContent = `Current: (${xVal.toFixed(2)}, ${yVal.toFixed(2)})`;
        this.drawCurrentPosition(xVal, yVal);
      }
    }
  }

  drawCurrentPosition(x, y) {
    // Draw current position as a dot on the canvas
    const ctx = this.ctx;
    const pixelX = this.metersToPixels(x, 'x');
    const pixelY = this.metersToPixels(y, 'y');
    
    // Only draw if within bounds
    if (pixelX >= 0 && pixelX <= this.canvas.width && pixelY >= 0 && pixelY <= this.canvas.height) {
      ctx.fillStyle = '#ff6b6b';
      ctx.beginPath();
      ctx.arc(pixelX, pixelY, 6, 0, 2 * Math.PI);
      ctx.fill();
      
      // Add a white border
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  attachEventListeners() {
    // Entity selection handlers
    const xSelect = this.shadowRoot.getElementById('xEntitySelect');
    const ySelect = this.shadowRoot.getElementById('yEntitySelect');
    const setEntitiesBtn = this.shadowRoot.getElementById('setEntitiesBtn');
    
    xSelect.addEventListener('change', () => this.updateEntityStatus());
    ySelect.addEventListener('change', () => this.updateEntityStatus());
    
    setEntitiesBtn.addEventListener('click', () => {
      const xEntity = xSelect.value;
      const yEntity = ySelect.value;
      
      if (xEntity && yEntity) {
        this.xEntity = xEntity;
        this.yEntity = yEntity;
        
        // Call the set_entities service
        this._hass.callService('zone_mapper', 'set_entities', {
          x_entity: xEntity,
          y_entity: yEntity
        });
        
        this.updateEntityStatus();
      } else {
        alert('Please select both X and Y entities');
      }
    });

    // Zone selection buttons
    this.shadowRoot.querySelectorAll('.zone-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.shadowRoot.querySelectorAll('.zone-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedZone = parseInt(btn.dataset.zone);
      });
    });

    // Clear button
    this.shadowRoot.getElementById('clearBtn').addEventListener('click', () => {
      this.zones = [];
      this.drawGrid();
      this.updateZoneList();
      // Clear all zones in Home Assistant
      for (let i = 1; i <= this.maxZones; i++) {
        this.updateHomeAssistant(i, 0, 0, 0, 0);
      }
    });

    // Canvas drawing
    this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
    this.canvas.addEventListener('mousemove', (e) => this.draw(e));
    this.canvas.addEventListener('mouseup', (e) => this.endDrawing(e));

    // Select first zone by default
    this.shadowRoot.querySelector('.zone-btn').click();
  }

  startDrawing(e) {
    if (this.selectedZone === null) return;

    this.isDrawing = true;
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    this.startPoint = {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  draw(e) {
    if (!this.isDrawing) return;

    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    const currentPoint = {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };

    // Redraw everything
    this.drawGrid();

    // Draw current rectangle
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    const width = currentPoint.x - this.startPoint.x;
    const height = currentPoint.y - this.startPoint.y;

    ctx.strokeRect(this.startPoint.x, this.startPoint.y, width, height);
    ctx.setLineDash([]);
  }

  endDrawing(e) {
    if (!this.isDrawing) return;

    this.isDrawing = false;

    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    const endPoint = {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };

    // Convert to meters and store
    const x_min = Math.min(
      this.pixelsToMeters(this.startPoint.x, 'x'),
      this.pixelsToMeters(endPoint.x, 'x')
    );
    const x_max = Math.max(
      this.pixelsToMeters(this.startPoint.x, 'x'),
      this.pixelsToMeters(endPoint.x, 'x')
    );
    const y_min = Math.min(
      this.pixelsToMeters(this.startPoint.y, 'y'),
      this.pixelsToMeters(endPoint.y, 'y')
    );
    const y_max = Math.max(
      this.pixelsToMeters(this.startPoint.y, 'y'),
      this.pixelsToMeters(endPoint.y, 'y')
    );

    // Store zone
    this.zones[this.selectedZone] = {
      x_min: Math.max(-6, Math.min(6, x_min)),
      x_max: Math.max(-6, Math.min(6, x_max)),
      y_min: Math.max(-6, Math.min(6, y_min)),
      y_max: Math.max(-6, Math.min(6, y_max))
    };

    // Update display
    this.drawGrid();
    this.updateZoneList();

    // Update Home Assistant
    this.updateHomeAssistant(
      this.selectedZone + 1,
      this.zones[this.selectedZone].x_min,
      this.zones[this.selectedZone].x_max,
      this.zones[this.selectedZone].y_min,
      this.zones[this.selectedZone].y_max
    );
  }

  updateHomeAssistant(zoneId, x_min, x_max, y_min, y_max) {
    if (!this._hass) return;

    this._hass.callService('zone_mapper', 'update_zone', {
      zone_id: zoneId,
      x_min: x_min,
      x_max: x_max,
      y_min: y_min,
      y_max: y_max
    });
  }

  updateZoneList() {
    const list = this.shadowRoot.getElementById('zoneList');
    list.innerHTML = '';

    this.zones.forEach((zone, index) => {
      if (zone) {
        const item = document.createElement('div');
        item.className = 'zone-item';
        item.innerHTML = `
          <strong>Zone ${index + 1}:</strong> 
          X: [${zone.x_min.toFixed(1)}m, ${zone.x_max.toFixed(1)}m] 
          Y: [${zone.y_min.toFixed(1)}m, ${zone.y_max.toFixed(1)}m]
        `;
        list.appendChild(item);
      }
    });
  }

  updateZonesFromEntities() {
    // Load existing zones from Home Assistant entities
    if (!this._hass) return;

    for (let i = 1; i <= this.maxZones; i++) {
      const x_min = this._hass.states[`sensor.zone_${i}_x_min`];
      const x_max = this._hass.states[`sensor.zone_${i}_x_max`];
      const y_min = this._hass.states[`sensor.zone_${i}_y_min`];
      const y_max = this._hass.states[`sensor.zone_${i}_y_max`];

      if (x_min && x_max && y_min && y_max) {
        const xMinVal = parseFloat(x_min.state);
        const xMaxVal = parseFloat(x_max.state);
        const yMinVal = parseFloat(y_min.state);
        const yMaxVal = parseFloat(y_max.state);

        if (xMinVal !== 0 || xMaxVal !== 0 || yMinVal !== 0 || yMaxVal !== 0) {
          this.zones[i - 1] = {
            x_min: xMinVal,
            x_max: xMaxVal,
            y_min: yMinVal,
            y_max: yMaxVal
          };
        }
      }
    }

    this.drawGrid();
    this.updateZoneList();
  }

  getCardSize() {
    return 6;
  }
}

customElements.define('zone-mapper-card', ZoneMapperCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'zone-mapper-card',
  name: 'Zone Mapper Card',
  description: 'Draw and manage detection zones'
});
