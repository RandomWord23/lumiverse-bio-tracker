// Injected CSS stylesheet, theme variables, and layout style constants
// for the Bio Tracker frontend panel.

/**
 * Main injected stylesheet applied to the page via `ctx.dom.addStyle()`.
 * Contains all `#bio-tracker-panel`, `.bt-*`, and `#bt-preview-*` rules.
 */
export const bioTrackerStylesheet = `
    #bio-tracker-panel { position: fixed; top: 0; right: -400px; width: 350px; max-width: 100vw; height: 100%; background: #1a1a1a; color: #e0e0e0; z-index: 10000; transition: right 0.3s ease-in-out; box-shadow: -5px 0 20px rgba(0,0,0,0.6); display: flex; flex-direction: column; font-family: system-ui, -apple-system, sans-serif; border-left: 1px solid #333; }
    .bt-toggle-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #2a2a2a; }
    .bt-toggle-row:last-child { border-bottom: none; }
    .bt-toggle-label { font-size: 13px; color: #ccc; flex: 1; }
    .bt-toggle-desc { font-size: 11px; color: #666; margin-top: 2px; }
    .bt-switch { position: relative; width: 40px; height: 22px; background: #444; border-radius: 11px; cursor: pointer; transition: background 0.2s; flex-shrink: 0; }
    .bt-switch.on { background: #ff4444; }
    .bt-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; background: #fff; border-radius: 50%; transition: left 0.2s; }
    .bt-switch.on::after { left: 20px; }
    .bt-slider-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .bt-slider-row span { font-size: 13px; color: #ccc; min-width: 100px; }
    .bt-slider-row input[type="range"] { flex: 1; accent-color: #ff4444; }
    .bt-slider-val { font-size: 12px; color: #ff4444; font-weight: bold; min-width: 40px; text-align: right; }
    .bt-reset-btn { background: #333; color: #aaa; border: 1px solid #555; padding: 8px; border-radius: 4px; cursor: pointer; font-size: 12px; width: 100%; margin-top: 10px; }
    .bt-reset-btn:active { background: #555; }
    #bio-tracker-panel.open { right: 0; }
    .bt-header { background: #2a2a2a; padding: 15px 20px; font-size: 18px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #ff4444; }
    .bt-close { cursor: pointer; color: #ff4444; font-size: 20px; padding: 5px; }
    .bt-content { flex: 1; overflow-y: auto; padding: 15px; padding-bottom: 80px; }
    .bt-tabs { display: flex; background: #111; border-bottom: 1px solid #333; }
    .bt-tab-btn { flex: 1; padding: 12px 0; background: transparent; color: #888; border: none; font-weight: bold; cursor: pointer; text-align: center; font-size: 13px; }
    .bt-tab-btn.active { color: #ff4444; border-bottom: 2px solid #ff4444; background: #222; }
    .bt-tab-content { display: none; }
    .bt-tab-content.active { display: block; }
    .bt-sub-tabs { display: flex; margin-bottom: 15px; border-radius: 6px; overflow: hidden; border: 1px solid #333; }
    .bt-sub-btn { flex: 1; padding: 8px 0; background: #222; color: #aaa; border: none; font-size: 12px; cursor: pointer; }
    .bt-sub-btn.active { background: #444; color: #fff; }
    .bt-sub-content { display: none; }
    .bt-sub-content.active { display: block; }
    .bt-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 14px; }
    .bt-input, .bt-textarea, .bt-select { background: #111; border: 1px solid #444; color: #fff; border-radius: 4px; padding: 6px; transition: border-left 0.2s ease; }
    .bt-input { width: 90px; text-align: right; }
    .bt-select { padding: 4px; font-size: 12px; color: #fff; background: #111; border: 1px solid #444; border-radius: 4px; }
    .bt-input-wide { width: 65%; text-align: left; }
    .bt-input-small { width: 50px; text-align: center; }
    .bt-input.full { width: 100%; text-align: left; margin-bottom: 10px; box-sizing: border-box; }
    .bt-textarea { width: 100%; box-sizing: border-box; resize: vertical; margin-bottom: 10px; }
    .bt-value { font-weight: bold; color: #ff4444; }
    .bt-section-title { font-size: 12px; color: #ff4444; margin: 15px 0 8px; border-bottom: 1px solid #333; padding-bottom: 3px; font-weight: bold; letter-spacing: 1px; }
    .bt-add-btn { background: #2a2a2a; color: #4CAF50; border: 1px solid #333; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-weight: bold; float: right; font-size: 11px; }
    .bt-dynamic-item { background: #222; border: 1px dashed #444; padding: 10px; border-radius: 6px; margin-bottom: 10px; position: relative; }
    .bt-remove-btn { position: absolute; top: 10px; right: 10px; background: transparent; border: none; color: #ff4444; cursor: pointer; font-size: 16px; }
    .bt-action-btn { width: 100%; padding: 12px; background: #333; color: white; border: 1px solid #444; border-radius: 4px; cursor: pointer; margin-bottom: 10px; font-weight: bold; transition: background 0.2s; touch-action: manipulation; pointer-events: auto; }
    .slot-label { font-size: 11px; color: #888; text-transform: uppercase; margin-bottom: 2px; display: block; }
    .flex-row { display: flex; justify-content: space-between; align-items: center; }
    .vital-slot { background: #222; border: 1px dashed #555; border-radius: 6px; padding: 8px; margin-bottom: 8px; position: relative; }
    .vital-remove { position: absolute; top: 5px; right: 5px; background: none; border: none; color: #ff4444; cursor: pointer; font-size: 14px; }
    #bt-preview-modal { position: fixed; top: 10%; left: 5%; width: 90%; height: 80%; background: #111; border: 2px solid #ff4444; border-radius: 8px; z-index: 100000; display: none; flex-direction: column; box-shadow: 0 10px 30px rgba(0,0,0,0.8); }
    #bt-preview-header { background: #222; padding: 10px; font-weight: bold; display: flex; justify-content: space-between; color: #ff4444; border-bottom: 1px solid #444; }
    #bt-preview-content { flex: 1; overflow-y: auto; padding: 15px; color: #a5d6a7; font-family: monospace; font-size: 12px; white-space: pre-wrap; }
    #bt-preview-close { background: #ff4444; color: white; border: none; padding: 12px; font-weight: bold; cursor: pointer; border-radius: 0 0 6px 6px; }
    .cloth-badge { margin-left: 6px; font-size: 11px; font-weight: bold; text-transform: none; }
    .bt-flag-btn { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); background: transparent; border: none; cursor: pointer; font-size: 11px; opacity: 0.25; padding: 2px 4px; z-index: 10; touch-action: manipulation; pointer-events: auto; }
    .bt-flag-btn[data-flagged="true"] { opacity: 1; }
    .bt-flag-wrap { position: relative; width: 100%; }
  `

/**
 * Theme color map for hair/eyes/skin text inputs. Keys are matched
 * (case-insensitively, via substring) against the input value.
 */
export const colorMap: Record<string, string> = {
  blonde: '#e8c872', blond: '#e8c872', brunette: '#5c4033', brown: '#5c4033',
  black: '#333333', red: '#cc3333', ginger: '#d95a2b', blue: '#3366cc',
  green: '#339966', hazel: '#8e7618', purple: '#800080', pink: '#ff99cc',
  white: '#ffffff', gray: '#808080', grey: '#808080', pale: '#ffe4e1', tan: '#d2b48c',
}

/**
 * Clothing condition color constants, keyed by condition name.
 */
export const condColors: Record<string, string> = {
  intact: '#4CAF50', snug: '#ffeb3b', strained: '#ff9800',
  tight: '#ff5722', damaged: '#ff4444', ruined: '#ff0000',
}
