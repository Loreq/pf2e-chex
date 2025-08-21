import * as C from "./const.mjs";
import ChexFormulaParser from "./formula-parser.mjs";

export default class ChexDrawingLayer extends PIXI.Container {
  constructor() {
    super();
    this.zIndex = 0;
    this.visible = false;

    /**
     * Stores a PIXI.Graphics object and its fingerprint for each layer/type
     * Map<string, { graphics: PIXI.Graphics, fingerprint: string }>
     */
    this._graphicsByType = new Map();
  }

  /**
   * Draws or toggles the layer corresponding to the current mode.
   * Only one layer is visible at a time; previously drawn layers are cached.
   */
  async draw() {
    this.mask = canvas.primary.mask;

    const layerType = this.#getLayerTypeFromMode();
    if (!layerType) return;

    // Hide all other layers first
    for (const [key, entry] of this._graphicsByType.entries()) {
      if (entry) entry.graphics.visible = false;
    }

    // Draw or show the requested layer
    await this.#toggleOrDrawLayer(layerType);
  }

  /**
   * Returns the layer type string based on the current manager mode.
   * @private
   * @returns {"terrain"|"realm"|"travel"|null}
   */
  #getLayerTypeFromMode() {
    switch (chex.manager.mode) {
      case C.MODE_TERRAIN: return "terrain";
      case C.MODE_REALM: return "realm";
      case C.MODE_TRAVEL: return "travel";
      default: return null;
    }
  }

  /**
   * Shows cached graphics or draws it if the hexes/color changed.
   * @private
   * @param {string} layerType - "terrain", "realm", or "travel"
   */
  async #toggleOrDrawLayer(layerType) {
    const hexGroups = this.#getHexGroups(layerType);

    for (const [key, hexes] of Object.entries(hexGroups)) {
      const color = this.#getColor(layerType, key);
      const fingerprint = this.#computeLayerFingerprint(hexes, color);

      const cached = this._graphicsByType.get(key);

      if (cached?.fingerprint === fingerprint) {
        // Already drawn, just show it
        cached.graphics.visible = true;
      } else {
        // Remove old graphics if exists
        if (cached) cached.graphics.destroy();

        // Draw new graphics
        const g = await this.#drawHexGroup(hexes, color, 0.15, key);
        this._graphicsByType.set(key, { graphics: g, fingerprint });
      }
    }
  }

  /**
   * Draws a group of hexes with specified color/alpha and returns the PIXI.Graphics object.
   * @private
   * @param {Array} hexes - Array of hex objects
   * @param {number} color - Hex color value
   * @param {number} alpha - Transparency (0.0 - 1.0)
   * @param {string} key - Unique key for caching
   * @returns {PIXI.Graphics} The drawn graphics object
   */
  async #drawHexGroup(hexes, color, alpha, key) {
    if (!hexes.length) return;

    const g = new PIXI.Graphics();
    g.beginFill(color, alpha).lineStyle({ width: 1, color });

    for (let i = 0; i < hexes.length; i++) {
      const hex = hexes[i];
      const vertices = canvas.grid.getVertices(hex.offset);
      g.drawPolygon(vertices);

      // Yield occasionally to avoid freezing on large maps
      if (i % 1000 === 0) await new Promise(resolve => requestIdleCallback(resolve));
    }

    g.endFill();
    this.addChild(g);
    return g;
  }

  /**
   * Computes a lightweight fingerprint for a hex group + color.
   * Used to detect changes and avoid unnecessary redraws.
   * @private
   * @param {Array} hexes - Array of hex objects
   * @param {number} color - Fill color
   * @returns {string} Fingerprint string
   */
  #computeLayerFingerprint(hexes, color) {
    const ids = hexes.map(h => h.id).sort().join(",");
    return `${color}:${ids}`;
  }

  /**
   * Returns the fill color for a given layer type and key.
   * @private
   * @param {string} layerType - "terrain", "realm", or "travel"
   * @param {string} key - Layer key string
   * @returns {number} Hex color value
   */
  #getColor(layerType, key) {
    switch (layerType) {
      case "terrain": return chex.terrains[key.split("-")[1]]?.color || C.FALLBACK_COLOR;
      case "realm": return chex.realms[key.split("-")[1]]?.color || C.FALLBACK_COLOR;
      case "travel": return chex.travels[key.split("-")[1]]?.color || C.FALLBACK_COLOR;
      default: return C.FALLBACK_COLOR;
    }
  }

  /**
   * Returns hex groups by layer type. Each group is keyed for caching.
   * @private
   * @param {string} layerType - "terrain", "realm", or "travel"
   * @returns {Object<string, Array>} Object mapping keys to arrays of hexes
   */
  #getHexGroups(layerType) {
    const groups = {};
    switch (layerType) {
      case "terrain":
        for (const hex of chex.manager.hexes) {
          const tid = hex.terrain.id;
          if (!groups[`terrain-${tid}`]) groups[`terrain-${tid}`] = [];
          groups[`terrain-${tid}`].push(hex);
        }
        break;
      case "realm":
        for (const hex of chex.manager.hexes) {
          const rid = hex.hexData.claimed;
          if (!groups[`realm-${rid}`]) groups[`realm-${rid}`] = [];
          groups[`realm-${rid}`].push(hex);
        }
        break;
      case "travel":
        for (const hex of chex.manager.hexes) {
          const tid = ChexFormulaParser.getTravel(hex.hexData);
          if (!groups[`travel-${tid}`]) groups[`travel-${tid}`] = [];
          groups[`travel-${tid}`].push(hex);
        }
        break;
    }
    return groups;
  }
}
