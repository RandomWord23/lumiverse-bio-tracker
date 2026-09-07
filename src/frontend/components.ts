// UI component renderers and HTML template builders
// for the Bio Tracker frontend panel. These functions construct
// DOM elements and are extracted from `src/frontend.ts` so the
// main setup module can stay focused on wiring and behavior.

import type { SpindleFrontendContext } from 'lumiverse-spindle-types'
import type {
  ToastCategoryDef,
  EngineToggleDef,
  BuffTargetDef,
  BioTrackerSettings,
} from './types'
import { saveSettings, sendSettingsToBackend } from './api'

/**
 * Build a toggle row for a toast category or engine feature toggle.
 * The row mutates the shared `currentSettings` object in place when
 * clicked, persists the change, and forwards it to the backend.
 */
export function buildToggleRow(
  def: ToastCategoryDef | EngineToggleDef,
  section: 'toast' | 'engine',
  currentSettings: BioTrackerSettings,
  ctx: SpindleFrontendContext,
): HTMLElement {
  const row = document.createElement('div')
  row.className = 'bt-toggle-row'
  const isOn = currentSettings[section][def.key]
  const labelDiv = document.createElement('div')
  const labelEl = document.createElement('div')
  labelEl.className = 'bt-toggle-label'
  labelEl.textContent = def.label
  const descEl = document.createElement('div')
  descEl.className = 'bt-toggle-desc'
  descEl.textContent = def.desc
  labelDiv.appendChild(labelEl)
  labelDiv.appendChild(descEl)
  const sw = document.createElement('div')
  sw.className = 'bt-switch' + (isOn ? ' on' : '')
  sw.dataset.section = section
  sw.dataset.key = def.key
  sw.addEventListener('click', () => {
    const nowOn = !currentSettings[section][def.key]
    currentSettings[section][def.key] = nowOn
    sw.classList.toggle('on', nowOn)
    saveSettings(currentSettings)
    sendSettingsToBackend(ctx, currentSettings)
  })
  row.appendChild(labelDiv)
  row.appendChild(sw)
  return row
}

/* ── Item slot factory ────────────────────────────────────────── */

/**
 * Configuration describing how a vital-slot (stomach / womb / balls)
 * item creator differs from its siblings. The three zones share
 * nearly identical markup; only a handful of labels, CSS classes,
 * and the presence of a struggle row vary.
 */
interface ItemSlotConfig {
  /** CSS modifier class on the `.vital-slot` container (is-food, is-womb, is-balls). */
  containerClass: string
  /** `data-action` value for the remove button. */
  removeAction: string
  /** CSS class appended to the volume input (stomach-vol, womb-vol, balls-vol). */
  volClass: string
  /** Label for the digestion / absorption / conversion percentage field. */
  digLabel: string
  /** Placeholder for the flavor textarea. */
  flavorPlaceholder: string
  /** Whether this zone tracks struggle (stomach only). */
  hasStruggle: boolean
}

/**
 * Internal parameterised factory that builds a stomach / womb / balls
 * item slot. The three public wrappers below supply zone-specific
 * config and preserve the original call signatures.
 *
 * All visual styling lives in the stylesheet — no inline styles are
 * emitted. Type-aware visibility toggling mirrors the original
 * behaviour: stomach cycles through `is-food` / `is-liquid` / `is-prey`
 * while womb and balls only toggle `is-prey`.
 */
function createItemSlot(cfg: ItemSlotConfig): HTMLElement {
  const div = document.createElement('div')
  div.className = `vital-slot ${cfg.containerClass}`

  const struggleRowHtml = cfg.hasStruggle
    ? `<div class="flex-row bt-struggle-row v-prey-struggle">
         <span>Struggle:</span>
         <span class="bt-struggle-val v-struggle-val" title="Indigestion % contributed by this prey per tick (extension-managed)">+0.00%</span>
       </div>`
    : ''

  div.innerHTML = `
      <button class="vital-remove" data-action="${cfg.removeAction}">✖</button>
      <div class="flex-row bt-item-header">
        <input type="text" class="bt-input bt-item-name v-name" placeholder="Item Name...">
        <select class="bt-select bt-item-type v-type">
          <option value="Liquid">Liquid</option>
          <option value="Food" selected>Food</option>
          <option value="Prey">Prey</option>
        </select>
      </div>
      <div class="flex-row bt-status-row">
        <span>Status: <strong class="bt-status-val item-status">Fully Conscious</strong></span>
      </div>
      <div class="flex-row bt-willingness-row v-prey-willingness">
        <span>Willingness:</span>
        <select class="bt-select bt-willingness-select v-willingness">
          <option value="willing">Willing</option>
          <option value="reluctant" selected>Reluctant</option>
          <option value="fighting">Fighting</option>
        </select>
        <span class="bt-stamina-label">Stamina:</span>
        <div class="bt-bar-track">
          <div class="bt-bar-fill v-stamina-bar"></div>
        </div>
        <span class="bt-bar-val v-stamina-val">100%</span>
      </div>
      ${struggleRowHtml}
      <div class="flex-row bt-vol-row">
        <span>Vol (L): <input type="number" class="bt-input bt-vol-input ${cfg.volClass} v-vol" value="0"></span>
        <span>${cfg.digLabel}: <input type="number" class="bt-input bt-dig-input item-dig-input v-dig" value="0"></span>
      </div>
      <textarea class="bt-textarea bt-item-appearance v-appearance" rows="2" placeholder="Appearance (age, species, build, hair, eyes)..."></textarea>
      <textarea class="bt-textarea bt-item-flavor v-flavor" rows="2" placeholder="${cfg.flavorPlaceholder}"></textarea>
      <textarea class="bt-textarea bt-item-gear v-gear" rows="2" placeholder="Bound Gear / Items..."></textarea>
    `

  const typeSelect = div.querySelector('.v-type') as HTMLSelectElement
  const gearArea = div.querySelector('.v-gear') as HTMLTextAreaElement
  const appearanceArea = div.querySelector('.v-appearance') as HTMLTextAreaElement
  const statusSpan = div.querySelector('.item-status') as HTMLElement
  const willingnessRow = div.querySelector('.v-prey-willingness') as HTMLElement
  const struggleRow = cfg.hasStruggle
    ? (div.querySelector('.v-prey-struggle') as HTMLElement)
    : null

  typeSelect.addEventListener('change', () => {
    const isPrey = typeSelect.value === 'Prey'
    const isLiquid = typeSelect.value === 'Liquid'
    gearArea.style.display = isPrey ? 'block' : 'none'
    appearanceArea.style.display = isPrey ? 'block' : 'none'
    willingnessRow.style.display = isPrey ? 'flex' : 'none'
    if (struggleRow) struggleRow.style.display = isPrey ? 'flex' : 'none'
    // Stomach slots cycle through is-food / is-liquid / is-prey;
    // womb & balls only toggle is-prey.
    if (cfg.containerClass === 'is-food') {
      div.classList.toggle('is-food', !isPrey && !isLiquid)
      div.classList.toggle('is-liquid', isLiquid)
    }
    div.classList.toggle('is-prey', isPrey)
    statusSpan.style.display = isPrey ? 'inline' : 'none'
  })

  return div
}

/**
 * Create a stomach item slot (food / liquid / prey) with type-aware
 * visibility toggling for prey-only fields, including a struggle row.
 */
export function createStomachItem(): HTMLElement {
  return createItemSlot({
    containerClass: 'is-food',
    removeAction: 'remove-stomach',
    volClass: 'stomach-vol',
    digLabel: 'Dig %',
    flavorPlaceholder: 'Current action/state (e.g. thrashing, dissolving)...',
    hasStruggle: true,
  })
}

/**
 * Create a womb prey/food slot — same structure as createStomachItem
 * but with "Absorption %" label, is-womb CSS class, and womb-vol volume class.
 * No struggle display (womb has no struggle).
 */
export function createWombItem(): HTMLElement {
  return createItemSlot({
    containerClass: 'is-womb',
    removeAction: 'remove-womb',
    volClass: 'womb-vol',
    digLabel: 'Abs %',
    flavorPlaceholder: 'Current action/state (e.g. thrashing, absorbing)...',
    hasStruggle: false,
  })
}

/**
 * Create a balls prey/food slot — same structure as createStomachItem
 * but with "Conversion %" label, is-balls CSS class, and balls-vol volume class.
 * No struggle display (balls have no struggle).
 */
export function createBallsItem(): HTMLElement {
  return createItemSlot({
    containerClass: 'is-balls',
    removeAction: 'remove-balls',
    volClass: 'balls-vol',
    digLabel: 'Conv %',
    flavorPlaceholder: 'Current action/state (e.g. thrashing, converting)...',
    hasStruggle: false,
  })
}

/**
 * Create a bowel remains slot (waste / digested output).
 */
export function createRemainsItem(): HTMLElement {
  const div = document.createElement('div')
  div.className = 'vital-slot is-remains'
  div.innerHTML = `
      <button class="vital-remove" data-action="remove-remains">✖</button>
      <div class="flex-row bt-item-header">
        <input type="text" class="bt-input bt-item-name v-name" placeholder="Waste / Remains Name...">
      </div>
      <div class="flex-row">
        <span>Vol (L): <input type="number" class="bt-input bt-vol-input bowel-vol v-vol" value="0"></span>
      </div>
    `
  return div
}

/**
 * Create a buff/debuff entry row with a stat target dropdown,
 * percentage input, and remove button.
 */
export function createBuffEntry(buffTargetDefs: BuffTargetDef[]): HTMLElement {
  const div = document.createElement('div')
  div.className = 'bt-buff-entry'
  const select = document.createElement('select')
  select.className = 'bt-input bt-buff-stat'
  buffTargetDefs.forEach(t => {
    const opt = document.createElement('option')
    opt.value = t.value
    opt.textContent = t.label
    select.appendChild(opt)
  })
  const input = document.createElement('input')
  input.type = 'number'
  input.className = 'bt-input bt-buff-pct'
  input.placeholder = '+25'
  const btn = document.createElement('button')
  btn.className = 'bt-remove-btn'
  btn.dataset.action = 'remove-buff'
  btn.textContent = '✖'
  div.appendChild(select)
  div.appendChild(input)
  div.appendChild(btn)
  return div
}

/**
 * Create a skill row with name, level, description, and a
 * buffs/debuffs section.
 */
export function createSkillItem(): HTMLElement {
  const div = document.createElement('div')
  div.className = 'bt-dynamic-item dyn-skill'
  div.innerHTML = `<button class="bt-remove-btn" data-action="remove-skill">✖</button><input type="text" class="bt-input bt-skill-name d-name" placeholder="Skill Name"><input type="number" class="bt-input bt-skill-lvl d-lvl" placeholder="Lvl"><textarea class="bt-textarea d-desc" rows="2" placeholder="Description..."></textarea><div class="bt-buffs-section"><div class="bt-buffs-header"><span>Buffs/Debuffs</span><button class="bt-add-btn bt-add-buff" data-action="add-buff">+ Add</button></div><div class="bt-buffs-container"></div></div>`
  return div
}

/**
 * Create a trait row with name, description, and a
 * buffs/debuffs section.
 */
export function createTraitItem(): HTMLElement {
  const div = document.createElement('div')
  div.className = 'bt-dynamic-item dyn-trait'
  div.innerHTML = `<button class="bt-remove-btn" data-action="remove-trait">✖</button><input type="text" class="bt-input bt-trait-name d-name" placeholder="Trait Name"><textarea class="bt-textarea d-desc" rows="2" placeholder="Description..."></textarea><div class="bt-buffs-section"><div class="bt-buffs-header"><span>Buffs/Debuffs</span><button class="bt-add-btn bt-add-buff" data-action="add-buff">+ Add</button></div><div class="bt-buffs-container"></div></div>`
  return div
}

/**
 * Create an inventory item row with quantity, name, and remove button.
 */
export function createInvItem(): HTMLElement {
  const div = document.createElement('div')
  div.className = 'bt-row bt-inv-row dyn-inv'
  div.innerHTML = `<input type="number" class="bt-input bt-inv-qty d-qty" placeholder="#" value="1"><input type="text" class="bt-input bt-inv-name d-name" placeholder="Item name..."><button class="bt-inv-remove" data-action="remove-inv">✖</button>`
  return div
}

/**
 * Create a single die entry row with sides input, count input, and
 * a remove button. Used inside a dice section's dice container.
 */
export function createDiceEntry(): HTMLElement {
  const div = document.createElement('div')
  div.className = 'bt-dice-entry'
  div.innerHTML = `
    <span class="bt-dice-d-label">d</span>
    <input type="number" class="bt-input bt-dice-sides" placeholder="6" value="6" min="2" max="1000">
    <span class="bt-dice-x-label">×</span>
    <input type="number" class="bt-input bt-dice-count" placeholder="1" value="1" min="1" max="100">
    <button class="bt-remove-btn" data-action="remove-die">✖</button>
  `
  return div
}

/**
 * Create a named dice section container with a name input, a dice
 * entries container, an "Add Die" button, and a remove button.
 * Each section is an independent dice pool.
 */
export function createDiceSection(): HTMLElement {
  const div = document.createElement('div')
  div.className = 'bt-dice-section'
  div.innerHTML = `
    <div class="bt-dice-section-header">
      <input type="text" class="bt-input bt-dice-section-name" placeholder="Section name (e.g. Combat, Social, Magic)...">
      <button class="bt-remove-btn" data-action="remove-dice-section">✖</button>
    </div>
    <div class="bt-dice-container"></div>
    <button class="bt-add-btn bt-add-die" data-action="add-die">+ Add Die</button>
  `
  return div
}
