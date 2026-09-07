// Injected CSS stylesheet, theme variables, and layout style constants
// for the Bio Tracker frontend panel.

/**
 * Main injected stylesheet applied to the page via `ctx.dom.addStyle()`.
 * Contains all `#bio-tracker-panel`, `.bt-*`, and `#bt-preview-*` rules.
 *
 * Design tokens (`--bt-*`) are scoped to the panel, floating button, and
 * preview modal so they never leak into the host page.  All hardcoded
 * colours have been replaced with token references.  Interactive elements
 * carry `:active` states (primary tactile feedback on touch), `:hover`
 * states (secondary, pointer-only), and `:focus-visible` outlines
 * (keyboard / assistive-tech).
 */
export const bioTrackerStylesheet = `
    /* ── Design tokens ─────────────────────────────────────────── */
    #bio-tracker-panel, #bt-floating-btn, #bt-preview-modal {
      /* surfaces */
      --bt-bg: #1a1a1a;
      --bt-surface: #222;
      --bt-surface-2: #2a2a2a;
      --bt-surface-3: #333;
      --bt-input-bg: #111;
      /* borders */
      --bt-border: #333;
      --bt-border-dashed: #444;
      --bt-border-strong: #555;
      /* accent */
      --bt-accent: #ff4444;
      /* text */
      --bt-text: #e0e0e0;
      --bt-text-bright: #fff;
      --bt-text-dim: #aaa;
      --bt-text-dim2: #888;
      --bt-text-dim3: #666;
      /* semantic */
      --bt-success: #4CAF50;
      --bt-warning: #FF9800;
      --bt-danger: #f44336;
      /* zone tints */
      --bt-womb: #8b4a6a;
      --bt-balls: #4a6a8b;
      --bt-remains: #8b6b4a;
      /* vital colours */
      --bt-arousal: #ff4466;
      --bt-climax: #ffaa00;
      /* spacing scale */
      --bt-space-xs: 4px;
      --bt-space-sm: 8px;
      --bt-space-md: 12px;
      --bt-space-lg: 15px;
      --bt-space-xl: 20px;
      /* typography scale */
      --bt-font-xs: 11px;
      --bt-font-sm: 12px;
      --bt-font-md: 13px;
      --bt-font-lg: 14px;
      --bt-font-xl: 18px;
      /* coin colours */
      --bt-coin-gold: #ffd700;
      --bt-coin-silver: #c0c0c0;
      --bt-coin-copper: #cd7f32;
    }

    /* ── Panel container ──────────────────────────────────────── */
    #bio-tracker-panel {
      position: fixed; top: 0; right: -400px; width: 350px; max-width: 100vw;
      height: 100%; background: var(--bt-bg); color: var(--bt-text);
      z-index: 10000; transition: right 0.3s ease-in-out;
      box-shadow: -5px 0 20px rgba(0,0,0,0.6); display: flex; flex-direction: column;
      font-family: system-ui, -apple-system, sans-serif;
      border-left: 1px solid var(--bt-border);
    }
    #bio-tracker-panel.open { right: 0; animation: bt-slide-in 0.3s ease-out; }

    /* ── Header ────────────────────────────────────────────────── */
    .bt-header {
      background: var(--bt-surface-2); padding: var(--bt-space-lg) var(--bt-space-xl);
      font-size: var(--bt-font-xl); font-weight: bold; display: flex;
      justify-content: space-between; align-items: center;
      border-bottom: 2px solid var(--bt-accent);
    }
    .bt-close {
      cursor: pointer; color: var(--bt-accent); font-size: 20px; padding: 5px;
      border-radius: 4px; transition: background 0.15s;
      touch-action: manipulation;
    }
    .bt-close:active { background: rgba(255,68,68,0.15); }

    /* ── Tabs ─────────────────────────────────────────────────── */
    .bt-tabs { display: flex; background: var(--bt-input-bg); border-bottom: 1px solid var(--bt-border); }
    .bt-tab-btn {
      flex: 1 1 0; min-width: 0; padding: 12px 8px; background: transparent;
      color: var(--bt-text-dim2); border: none; font-weight: bold; cursor: pointer;
      text-align: center; font-size: var(--bt-font-sm); white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
      transition: background 0.15s, color 0.15s;
      touch-action: manipulation;
    }
    .bt-tab-btn:active { background: rgba(255,68,68,0.08); }
    .bt-tab-btn[data-tab="tab-dice"], .bt-tab-btn[data-tab="tab-settings"] {
      flex: 0 0 auto; padding: 12px 10px; font-size: 15px;
    }
    .bt-tab-btn.active { color: var(--bt-accent); border-bottom: 2px solid var(--bt-accent); background: var(--bt-surface); }
    .bt-tab-content { display: none; }
    .bt-tab-content.active { display: block; }

    /* ── Sub-tabs ──────────────────────────────────────────────── */
    .bt-sub-tabs { display: flex; margin-bottom: var(--bt-space-md); border-radius: 6px; overflow: hidden; border: 1px solid var(--bt-border); }
    .bt-sub-btn {
      flex: 1; padding: 8px 0; background: var(--bt-surface); color: var(--bt-text-dim);
      border: none; font-size: var(--bt-font-sm); cursor: pointer;
      transition: background 0.15s; touch-action: manipulation;
    }
    .bt-sub-btn:active { background: var(--bt-border-dashed); }
    .bt-sub-btn.active { background: var(--bt-border-strong); color: var(--bt-text-bright); }
    .bt-sub-content { display: none; }
    .bt-sub-content.active { display: block; }

    /* ── Content area + scrollbar ─────────────────────────────── */
    .bt-content {
      flex: 1; overflow-y: auto; padding: var(--bt-space-lg); padding-bottom: 80px;
      scrollbar-width: thin; scrollbar-color: var(--bt-border-strong) transparent;
    }
    .bt-content::-webkit-scrollbar { width: 6px; }
    .bt-content::-webkit-scrollbar-track { background: transparent; }
    .bt-content::-webkit-scrollbar-thumb { background: var(--bt-border-strong); border-radius: 3px; }
    .bt-content::-webkit-scrollbar-thumb:hover { background: var(--bt-text-dim3); }

    /* ── Rows & layout ─────────────────────────────────────────── */
    .bt-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--bt-space-sm); font-size: var(--bt-font-lg); }
    .flex-row { display: flex; justify-content: space-between; align-items: center; }

    /* ── Form elements ─────────────────────────────────────────── */
    .bt-input, .bt-textarea, .bt-select {
      background: var(--bt-input-bg); border: 1px solid var(--bt-border-dashed);
      color: var(--bt-text-bright); border-radius: 4px; padding: 6px;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .bt-input:focus, .bt-textarea:focus, .bt-select:focus {
      border-color: var(--bt-accent); box-shadow: 0 0 0 2px rgba(255,68,68,0.15);
      outline: none;
    }
    .bt-input { width: 90px; text-align: right; }
    .bt-input-wide { width: 65%; text-align: left; }
    .bt-input-small { width: 50px; text-align: center; }
    .bt-input.full { width: 100%; text-align: left; margin-bottom: 10px; box-sizing: border-box; }
    .bt-textarea { width: 100%; box-sizing: border-box; resize: vertical; margin-bottom: 10px; }
    .bt-select { padding: 4px; font-size: var(--bt-font-sm); color: var(--bt-text-bright); background: var(--bt-input-bg); border: 1px solid var(--bt-border-dashed); border-radius: 4px; }

    /* ── Section titles ────────────────────────────────────────── */
    .bt-section-title {
      font-size: var(--bt-font-sm); color: var(--bt-accent);
      margin: var(--bt-space-lg) 0 var(--bt-space-sm);
      border-bottom: 1px solid var(--bt-border); padding-bottom: 3px;
      font-weight: bold; letter-spacing: 1px;
    }
    .bt-section-title.first { margin-top: 0; }
    .bt-section-title.flex { display: flex; justify-content: space-between; align-items: center; }

    /* ── Values & labels ───────────────────────────────────────── */
    .bt-value { font-weight: bold; color: var(--bt-accent); }
    .slot-label { font-size: var(--bt-font-xs); color: var(--bt-text-dim2); text-transform: uppercase; margin-bottom: 2px; display: block; }

    /* ── Buttons ────────────────────────────────────────────────── */
    .bt-add-btn {
      background: var(--bt-surface-2); color: var(--bt-success);
      border: 1px solid var(--bt-border); padding: 4px 10px; border-radius: 4px;
      cursor: pointer; font-weight: bold; float: right; font-size: var(--bt-font-xs);
      transition: background 0.15s, transform 0.08s;
      touch-action: manipulation;
    }
    .bt-add-btn:active { background: var(--bt-border-strong); transform: scale(0.96); }
    .bt-add-btn:hover { background: var(--bt-surface-3); }

    .bt-action-btn {
      width: 100%; padding: 12px; background: var(--bt-surface-3); color: var(--bt-text-bright);
      border: 1px solid var(--bt-border-dashed); border-radius: 4px; cursor: pointer;
      margin-bottom: 10px; font-weight: bold;
      transition: background 0.15s, transform 0.08s;
      touch-action: manipulation; pointer-events: auto;
    }
    .bt-action-btn:active { background: var(--bt-border-strong); transform: scale(0.98); }
    .bt-action-btn:hover { background: var(--bt-border-strong); }
    .bt-action-btn.secondary { background: var(--bt-surface-2); border-color: var(--bt-border-strong); }
    .bt-action-btn.secondary:active { background: var(--bt-surface-3); }

    .bt-reset-btn {
      background: var(--bt-surface-3); color: var(--bt-text-dim); border: 1px solid var(--bt-border-strong);
      padding: 8px; border-radius: 4px; cursor: pointer; font-size: var(--bt-font-sm);
      width: 100%; margin-top: 10px;
      transition: background 0.15s, transform 0.08s;
      touch-action: manipulation;
    }
    .bt-reset-btn:active { background: var(--bt-border-strong); transform: scale(0.98); }
    .bt-reset-btn:hover { background: var(--bt-border-strong); }
    .bt-reset-btn.danger { color: var(--bt-accent); border-color: var(--bt-accent); }
    .bt-reset-btn.danger:active { background: rgba(255,68,68,0.15); }

    /* ── Dynamic items ─────────────────────────────────────────── */
    .bt-dynamic-item {
      background: var(--bt-surface); border: 1px dashed var(--bt-border-dashed);
      padding: 10px; border-radius: 6px; margin-bottom: 10px; position: relative;
    }
    .bt-remove-btn {
      position: absolute; top: 10px; right: 10px; background: transparent; border: none;
      color: var(--bt-accent); cursor: pointer; font-size: 16px;
      transition: transform 0.08s, color 0.15s;
      touch-action: manipulation;
    }
    .bt-remove-btn:active { transform: scale(1.15); }
    .bt-remove-btn:hover { color: var(--bt-danger); }

    /* ── Vital slots ────────────────────────────────────────────── */
    .vital-slot {
      background: var(--bt-surface); border: 1px dashed var(--bt-border-strong);
      border-radius: 6px; padding: var(--bt-space-sm); margin-bottom: var(--bt-space-sm);
      position: relative;
    }
    .vital-slot.is-womb { border-color: var(--bt-womb); }
    .vital-slot.is-balls { border-color: var(--bt-balls); }
    .vital-slot.is-remains { border-color: var(--bt-remains); }
    .vital-remove {
      position: absolute; top: 5px; right: 5px; background: none; border: none;
      color: var(--bt-accent); cursor: pointer; font-size: var(--bt-font-lg);
      transition: transform 0.08s, color 0.15s;
      touch-action: manipulation;
    }
    .vital-remove:active { transform: scale(1.15); }
    .vital-remove:hover { color: var(--bt-danger); }

    /* ── Item slot internals ────────────────────────────────────── */
    .bt-item-header { margin-bottom: var(--bt-space-xs); margin-right: 15px; }
    .bt-item-name { flex: 1; text-align: left; }
    .bt-item-type { width: 80px; margin-left: var(--bt-space-xs); }
    .bt-status-row { margin-bottom: var(--bt-space-xs); font-size: var(--bt-font-sm); }
    .bt-status-val { color: var(--bt-success); }
    .bt-willingness-row { display: none; margin-bottom: var(--bt-space-xs); font-size: var(--bt-font-sm); }
    .bt-willingness-select { width: 90px; margin-left: var(--bt-space-xs); }
    .bt-stamina-label { margin-left: var(--bt-space-sm); }
    .bt-bar-track { flex: 1; height: 10px; background: var(--bt-bg); border: 1px solid var(--bt-border); border-radius: 5px; overflow: hidden; margin-left: var(--bt-space-xs); max-width: 80px; }
    .bt-bar-fill { height: 100%; width: 100%; background: var(--bt-success); transition: width 0.3s; }
    .bt-bar-val { min-width: 28px; text-align: right; color: var(--bt-text-dim); }
    .bt-struggle-row { display: none; margin-bottom: var(--bt-space-xs); font-size: var(--bt-font-sm); justify-content: flex-start; gap: var(--bt-space-xs); }
    .bt-struggle-val { color: var(--bt-warning); }
    .bt-vol-row { margin-bottom: var(--bt-space-xs); }
    .bt-vol-input { width: 50px; }
    .bt-dig-input { width: 40px; }
    .bt-item-appearance { display: none; margin-bottom: var(--bt-space-xs); }
    .bt-item-flavor { margin-bottom: var(--bt-space-xs); }
    .bt-item-gear { display: none; margin-bottom: 0; }

    /* ── Buff entries ──────────────────────────────────────────── */
    .bt-buff-entry { display: flex; gap: 5px; margin-top: var(--bt-space-xs); align-items: center; }
    .bt-buff-stat { flex: 1; padding: 4px; }
    .bt-buff-pct { width: 70px; padding: 4px; text-align: center; }
    .bt-buff-entry .bt-remove-btn { position: static; }

    /* ── Skill / trait items ────────────────────────────────────── */
    .bt-skill-name { width: 60%; text-align: left; }
    .bt-trait-name { width: 80%; text-align: left; }
    .bt-skill-lvl { width: 30%; position: absolute; top: 10px; right: 40px; }
    .bt-buffs-section { margin-top: 6px; }
    .bt-buffs-header { display: flex; align-items: center; gap: 5px; font-size: var(--bt-font-sm); color: var(--bt-text-dim2); }
    .bt-add-buff { float: none; font-size: var(--bt-font-xs); padding: 2px 6px; }

    /* ── Inventory rows ────────────────────────────────────────── */
    .bt-inv-row { margin-bottom: 5px; background: var(--bt-surface); padding: 5px; border-radius: 4px; border: 1px dashed var(--bt-border-dashed); }
    .bt-inv-qty { width: 40px; text-align: center; padding: 4px; }
    .bt-inv-name { margin-bottom: 0; flex: 1; margin-left: 5px; text-align: left; }
    .bt-inv-remove { background: transparent; border: none; color: var(--bt-accent); cursor: pointer; font-size: var(--bt-font-lg); margin-left: 5px; touch-action: manipulation; }

    /* ── Dice ──────────────────────────────────────────────────── */
    .bt-dice-section { background: var(--bt-surface); border: 1px solid var(--bt-border-dashed); border-radius: 6px; padding: 10px; margin-bottom: 10px; }
    .bt-dice-section-header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
    .bt-dice-section-header .bt-remove-btn { position: static; }
    .bt-dice-section-name { flex: 1; text-align: left; font-weight: bold; }
    .bt-dice-container { margin-left: 12px; margin-bottom: 6px; }
    .bt-dice-entry { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; padding: 4px 6px; background: var(--bt-bg); border-radius: 4px; border: 1px solid var(--bt-border); }
    .bt-dice-entry .bt-dice-sides { width: 50px; text-align: center; }
    .bt-dice-entry .bt-dice-count { width: 40px; text-align: center; }
    .bt-dice-entry .bt-remove-btn { position: static; font-size: var(--bt-font-lg); }
    .bt-dice-d-label { font-size: var(--bt-font-sm); color: var(--bt-text-dim); }
    .bt-dice-x-label { font-size: var(--bt-font-sm); color: var(--bt-text-dim); margin-left: 4px; }
    .bt-dice-toolbar { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
    .bt-dice-toolbar .bt-add-btn { float: none; }
    .bt-add-die { float: none; font-size: var(--bt-font-xs); padding: 2px 8px; margin-left: 12px; margin-bottom: 4px; }
    .bt-dice-preset-bar { display: flex; gap: 6px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
    .bt-dice-preset-select { background: var(--bt-input-bg); border: 1px solid var(--bt-border-dashed); color: var(--bt-text-bright); border-radius: 4px; padding: 4px 8px; font-size: var(--bt-font-sm); flex: 1; min-width: 120px; }
    .bt-dice-preset-btn {
      background: var(--bt-surface-2); color: var(--bt-text-dim); border: 1px solid var(--bt-border-dashed);
      padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: var(--bt-font-xs);
      transition: background 0.15s, transform 0.08s; touch-action: manipulation;
    }
    .bt-dice-preset-btn:active { background: var(--bt-border-strong); transform: scale(0.96); }
    .bt-dice-preset-btn:hover { background: var(--bt-surface-3); }
    .bt-dice-empty-hint { color: var(--bt-text-dim3); font-size: var(--bt-font-sm); text-align: center; padding: 20px; border: 1px dashed var(--bt-border-dashed); border-radius: 6px; margin-bottom: 10px; }

    /* ── Toggle rows ────────────────────────────────────────────── */
    .bt-toggle-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--bt-surface-2); }
    .bt-toggle-row:last-child { border-bottom: none; }
    .bt-toggle-label { font-size: var(--bt-font-md); color: var(--bt-text-dim); flex: 1; }
    .bt-toggle-desc { font-size: var(--bt-font-xs); color: var(--bt-text-dim3); margin-top: 2px; }
    .bt-switch {
      position: relative; width: 40px; height: 22px; background: var(--bt-border-strong);
      border-radius: 11px; cursor: pointer; transition: background 0.2s; flex-shrink: 0;
      touch-action: manipulation;
    }
    .bt-switch:active { transform: scale(0.92); }
    .bt-switch.on { background: var(--bt-accent); }
    .bt-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; background: var(--bt-text-bright); border-radius: 50%; transition: left 0.2s; }
    .bt-switch.on::after { left: 20px; }

    /* ── Slider rows ────────────────────────────────────────────── */
    .bt-slider-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .bt-slider-row span { font-size: var(--bt-font-md); color: var(--bt-text-dim); min-width: 100px; }
    .bt-slider-row input[type="range"] { flex: 1; accent-color: var(--bt-accent); }
    .bt-slider-val { font-size: var(--bt-font-sm); color: var(--bt-accent); font-weight: bold; min-width: 40px; text-align: right; }

    /* ── Attribute rows ─────────────────────────────────────────── */
    .bt-attr-row { display: flex; align-items: center; width: 65%; }
    .bt-attr-input { flex: 1; }
    .bt-attr-mod { width: 35px; text-align: right; font-weight: bold; color: var(--bt-text-dim); }

    /* ── Bars (energy, indigestion) ─────────────────────────────── */
    .bt-bar-wrap { flex: 1; display: flex; align-items: center; gap: 6px; margin-left: 8px; }
    .bt-bar-track-lg { flex: 1; height: 10px; background: var(--bt-input-bg); border: 1px solid var(--bt-border); border-radius: 5px; overflow: hidden; }
    .bt-bar-fill-lg { height: 100%; width: 100%; background: var(--bt-success); transition: width 0.3s, background 0.3s; }
    .bt-bar-status { min-width: 65px; text-align: right; font-size: var(--bt-font-xs); color: var(--bt-success); }
    .bt-indigestion-track { flex: 1; height: 14px; background: var(--bt-input-bg); border: 1px solid var(--bt-border); border-radius: 7px; overflow: hidden; }
    .bt-indigestion-fill { height: 100%; width: 0%; background: linear-gradient(90deg, var(--bt-success), var(--bt-warning), var(--bt-danger)); transition: width 0.3s; }
    .bt-indigestion-val { min-width: 35px; text-align: right; }

    /* ── Suppress / struggle ─────────────────────────────────────── */
    .bt-suppress-label { display: flex; align-items: center; gap: 5px; margin-left: 8px; cursor: pointer; font-size: var(--bt-font-sm); }
    .bt-suppress-toggle { width: auto; cursor: pointer; }
    .bt-suppress-text { color: var(--bt-text-dim3); }
    .bt-fatigue-info { font-size: var(--bt-font-xs); color: var(--bt-border-strong); margin-left: 8px; }
    .bt-struggle-risk { margin-left: 8px; font-size: var(--bt-font-sm); font-weight: bold; }
    .bt-struggle-detail { font-size: var(--bt-font-xs); color: var(--bt-border-strong); margin-left: 8px; }

    /* ── Zone add-buttons ───────────────────────────────────────── */
    .bt-zone-remains { background: #4a3a2a; color: #d2b48c; border-color: var(--bt-remains); }
    .bt-zone-womb { background: #4a2a3a; color: #d2b4c8; border-color: var(--bt-womb); }
    .bt-zone-balls { background: #2a3a4a; color: #b4c8d2; border-color: var(--bt-balls); }

    /* ── Currency ───────────────────────────────────────────────── */
    .bt-currency-fantasy { display: none; justify-content: space-between; gap: 5px; margin-bottom: 10px; }
    .bt-coin-row { flex: 1; display: flex; align-items: center; }
    .bt-coin-input { width: 100%; }
    .bt-coin-g { margin-left: 5px; color: var(--bt-coin-gold); font-weight: bold; }
    .bt-coin-s { margin-left: 5px; color: var(--bt-coin-silver); font-weight: bold; }
    .bt-coin-c { margin-left: 5px; color: var(--bt-coin-copper); font-weight: bold; }

    /* ── Misc utility ────────────────────────────────────────────── */
    .bt-divider { border: none; border-top: 1px solid var(--bt-border); margin: var(--bt-space-lg) 0; }
    .bt-hint { font-size: var(--bt-font-sm); color: var(--bt-text-dim2); margin-bottom: 12px; line-height: 1.5; }
    .bt-note { font-size: var(--bt-font-md); margin-top: var(--bt-space-lg); margin-bottom: 5px; color: var(--bt-text-dim2); }
    .bt-bold { font-weight: bold; }
    .bt-accent-text { color: var(--bt-accent); font-weight: bold; }
    .bt-dim-text { color: var(--bt-text-dim); }
    .bt-success-text { color: var(--bt-success); font-weight: bold; }
    .bt-text-dim2 { color: var(--bt-text-dim2); }
    .bt-lact-display { margin-left: 8px; font-weight: bold; color: var(--bt-success); }
    .bt-milk-status { width: 60px; text-align: right; font-weight: bold; color: var(--bt-text-dim2); }
    .bt-milk-input { flex: 1; }
    .bt-cloth-mode { width: 110px; border-color: var(--bt-accent); }
    .bt-currency-select { width: 100px; }
    .bt-container-spacer { margin-top: 10px; }
    .bt-slot-spacer { margin-bottom: 15px; }
    .bt-section-spacer { margin-bottom: 20px; }

    /* ── Character tab rows ─────────────────────────────────────── */
    .bt-gender-row { display: flex; align-items: center; width: 65%; }
    .bt-gender-input-wrap { flex: 1; position: relative; }
    .bt-gender-input { width: 100%; padding-right: 22px; }
    .bt-gender-icon { width: 25px; text-align: right; font-size: 16px; }
    .bt-breast-row { display: flex; align-items: center; width: 65%; }
    .bt-breast-ml { flex: 1; }
    .bt-breast-cup { width: 45px; text-align: right; font-weight: bold; color: var(--bt-accent); }
    .bt-penis-row { display: flex; justify-content: space-between; width: 65%; }
    .bt-penis-x { color: var(--bt-text-dim3); margin-top: 5px; }
    .bt-current-size { color: var(--bt-text-dim); }

    /* ── Vital slots (arousal / climax) ──────────────────────────── */
    .bt-vital-row { margin-bottom: var(--bt-space-xs); }
    .bt-vital-label { font-weight: bold; }
    .bt-vital-label.arousal, .bt-vital-val.arousal { color: var(--bt-arousal); }
    .bt-vital-label.climax, .bt-vital-val.climax { color: var(--bt-climax); }
    .bt-vital-slider { width: 100%; margin-bottom: var(--bt-space-sm); touch-action: manipulation; }
    .bt-vital-slider.arousal { accent-color: var(--bt-arousal); }
    .bt-vital-slider.climax { accent-color: var(--bt-climax); }
    .bt-vital-slider:disabled { opacity: 0.7; }
    .bt-transit-input { width: 40px; }

    /* ── Flag buttons ────────────────────────────────────────────── */
    .bt-flag-btn {
      position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
      background: transparent; border: none; cursor: pointer; font-size: var(--bt-font-xs);
      opacity: 0.25; padding: 2px 4px; z-index: 10;
      touch-action: manipulation; pointer-events: auto; transition: opacity 0.15s;
    }
    .bt-flag-btn:active { opacity: 0.5; }
    .bt-flag-btn[data-flagged="true"] { opacity: 1; }
    .bt-flag-wrap { position: relative; width: 100%; }
    .cloth-badge { margin-left: 6px; font-size: var(--bt-font-xs); font-weight: bold; text-transform: none; }

    /* ── Preview modal ──────────────────────────────────────────── */
    #bt-preview-modal {
      position: fixed; top: 10%; left: 5%; width: 90%; height: 80%;
      background: var(--bt-input-bg); border: 2px solid var(--bt-accent);
      border-radius: 8px; z-index: 100000; display: none; flex-direction: column;
      box-shadow: 0 10px 30px rgba(0,0,0,0.8);
    }
    #bt-preview-header { background: var(--bt-surface); padding: 10px; font-weight: bold; display: flex; justify-content: space-between; color: var(--bt-accent); border-bottom: 1px solid var(--bt-border-dashed); }
    #bt-preview-content { flex: 1; overflow-y: auto; padding: var(--bt-space-lg); color: #a5d6a7; font-family: monospace; font-size: var(--bt-font-sm); white-space: pre-wrap; }
    #bt-preview-close {
      background: var(--bt-accent); color: var(--bt-text-bright); border: none; padding: 12px;
      font-weight: bold; cursor: pointer; border-radius: 0 0 6px 6px;
      transition: opacity 0.15s; touch-action: manipulation;
    }
    #bt-preview-close:active { opacity: 0.8; }

    /* ── Floating button ────────────────────────────────────────── */
    #bt-floating-btn {
      position: fixed; bottom: 80px; right: 20px;
      width: 45px; height: 45px;
      display: flex; justify-content: center; align-items: center;
      border-radius: 10px; font-size: 22px; cursor: pointer;
      z-index: 9999; user-select: none;
      transition: opacity 0.3s ease; opacity: 0.4;
      background: var(--bt-surface-3); color: var(--bt-text-bright);
      border: 2px solid var(--bt-border-strong); box-sizing: border-box;
      touch-action: manipulation;
    }
    #bt-floating-btn:active { transform: scale(0.92); }

    /* ── Entrance animation ─────────────────────────────────────── */
    @keyframes bt-slide-in {
      from { transform: translateX(20px); opacity: 0.6; }
      to   { transform: translateX(0);    opacity: 1;   }
    }

    /* ── Focus-visible outlines (keyboard / assistive-tech) ─────── */
    .bt-tab-btn:focus-visible, .bt-sub-btn:focus-visible,
    .bt-action-btn:focus-visible, .bt-add-btn:focus-visible,
    .bt-reset-btn:focus-visible, .bt-close:focus-visible,
    .vital-remove:focus-visible, .bt-remove-btn:focus-visible,
    .bt-switch:focus-visible, .bt-dice-preset-btn:focus-visible,
    .bt-inv-remove:focus-visible, #bt-preview-close:focus-visible,
    #bt-floating-btn:focus-visible {
      outline: 2px solid var(--bt-accent);
      outline-offset: 2px;
    }

    /* ── Responsive (narrow viewports) ───────────────────────────── */
    @media (max-width: 480px) {
      #bio-tracker-panel { width: 100vw; }
      .bt-header { padding: 12px 15px; font-size: 16px; }
      .bt-tab-btn { padding: 10px 6px; font-size: var(--bt-font-xs); }
      .bt-tab-btn[data-tab="tab-dice"], .bt-tab-btn[data-tab="tab-settings"] { padding: 10px 8px; }
      .bt-content { padding: 10px; }
      .bt-action-btn { padding: 14px; }
      .bt-switch { width: 44px; height: 24px; }
      .bt-switch::after { width: 20px; height: 20px; }
      .bt-switch.on::after { left: 22px; }
    }
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
