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

/**
 * Create a stomach item slot (food / liquid / prey) with type-aware
 * visibility toggling for prey-only fields.
 */
export function createStomachItem(): HTMLElement {
  const div = document.createElement('div')
  div.className = 'vital-slot is-food'
  div.innerHTML = `
      <button class="vital-remove" data-action="remove-stomach">✖</button>
      <div class="flex-row" style="margin-bottom: 5px; margin-right: 15px;">
        <input type="text" class="bt-input v-name" style="flex:1; text-align:left;" placeholder="Item Name...">
        <select class="bt-select v-type" style="width: 80px; margin-left: 5px;">
          <option value="Liquid">Liquid</option>
          <option value="Food" selected>Food</option>
          <option value="Prey">Prey</option>
        </select>
      </div>
      <div class="flex-row" style="margin-bottom: 5px; font-size: 12px;">
        <span>Status: <strong class="item-status" style="color:#4CAF50;">Fully Conscious</strong></span>
      </div>
      <div class="flex-row v-prey-willingness" style="margin-bottom: 5px; font-size: 12px; display: none;">
        <span>Willingness:</span>
        <select class="bt-select v-willingness" style="width: 90px; margin-left: 5px;">
          <option value="willing">Willing</option>
          <option value="reluctant" selected>Reluctant</option>
          <option value="fighting">Fighting</option>
        </select>
        <span style="margin-left: 8px;">Stamina:</span>
        <div style="flex:1; height:10px; background:#1a1a1a; border:1px solid #333; border-radius:5px; overflow:hidden; margin-left:4px; max-width:80px;">
          <div class="v-stamina-bar" style="height:100%; width:100%; background:#4CAF50; transition:width 0.3s;"></div>
        </div>
        <span class="v-stamina-val" style="min-width:28px; text-align:right; color:#aaa;">100%</span>
        <span style="margin-left: 8px;">Struggle:</span>
        <span class="v-struggle-val" style="min-width:42px; text-align:right; color:#FF9800;" title="Indigestion % contributed by this prey per tick (extension-managed)">+0.00%</span>
      </div>
      <div class="flex-row" style="margin-bottom: 5px;">
        <span>Vol (L): <input type="number" class="bt-input stomach-vol v-vol" style="width: 50px;" value="0"></span>
        <span>Dig %: <input type="number" class="bt-input item-dig-input v-dig" style="width: 40px;" value="0"></span>
      </div>
      <textarea class="bt-textarea v-appearance" rows="2" style="margin-bottom: 5px; display: none;" placeholder="Appearance (age, species, build, hair, eyes)..."></textarea>
      <textarea class="bt-textarea v-flavor" rows="2" style="margin-bottom: 5px;" placeholder="Current action/state (e.g. thrashing, dissolving)..."></textarea>
      <textarea class="bt-textarea v-gear" rows="2" style="margin-bottom: 0; display: none;" placeholder="Bound Gear / Items..."></textarea>
    `
  const typeSelect = div.querySelector('.v-type') as HTMLSelectElement
  const gearArea = div.querySelector('.v-gear') as HTMLTextAreaElement
  const appearanceArea = div.querySelector('.v-appearance') as HTMLTextAreaElement
  const statusSpan = div.querySelector('.item-status') as HTMLElement
  const willingnessRow = div.querySelector('.v-prey-willingness') as HTMLElement

  typeSelect.addEventListener('change', () => {
    if (typeSelect.value === 'Prey') {
      gearArea.style.display = 'block'
      appearanceArea.style.display = 'block'
      willingnessRow.style.display = 'flex'
      div.classList.remove('is-food', 'is-liquid')
      div.classList.add('is-prey')
      statusSpan.style.display = 'inline'
    } else if (typeSelect.value === 'Liquid') {
      gearArea.style.display = 'none'
      appearanceArea.style.display = 'none'
      willingnessRow.style.display = 'none'
      div.classList.remove('is-prey', 'is-food')
      div.classList.add('is-liquid')
      statusSpan.style.display = 'none'
    } else {
      gearArea.style.display = 'none'
      appearanceArea.style.display = 'none'
      willingnessRow.style.display = 'none'
      div.classList.remove('is-prey', 'is-liquid')
      div.classList.add('is-food')
      statusSpan.style.display = 'none'
    }
  })

  return div
}

/**
 * Create a bowel remains slot (waste / digested output).
 */
export function createRemainsItem(): HTMLElement {
  const div = document.createElement('div')
  div.className = 'vital-slot is-remains'
  div.style.borderColor = '#8b6b4a'
  div.innerHTML = `
      <button class="vital-remove" data-action="remove-remains">✖</button>
      <div class="flex-row" style="margin-bottom: 5px; margin-right: 15px;">
        <input type="text" class="bt-input v-name" style="flex:1; text-align:left;" placeholder="Waste / Remains Name...">
      </div>
      <div class="flex-row">
        <span>Vol (L): <input type="number" class="bt-input bowel-vol v-vol" style="width: 50px;" value="0"></span>
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
  div.style.cssText = 'display: flex; gap: 5px; margin-top: 4px; align-items: center;'
  const select = document.createElement('select')
  select.className = 'bt-input bt-buff-stat'
  select.style.cssText = 'flex: 1; padding: 4px;'
  buffTargetDefs.forEach(t => {
    const opt = document.createElement('option')
    opt.value = t.value
    opt.textContent = t.label
    select.appendChild(opt)
  })
  const input = document.createElement('input')
  input.type = 'number'
  input.className = 'bt-input bt-buff-pct'
  input.style.cssText = 'width: 70px; padding: 4px; text-align: center;'
  input.placeholder = '+25'
  const btn = document.createElement('button')
  btn.className = 'bt-remove-btn'
  btn.dataset.action = 'remove-buff'
  btn.textContent = '✖'
  btn.style.cssText = 'background: transparent; border: none; color: #ff4444; cursor: pointer; font-size: 14px;'
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
  div.innerHTML = `<button class="bt-remove-btn" data-action="remove-skill">✖</button><input type="text" class="bt-input full d-name" style="width: 60%;" placeholder="Skill Name"><input type="number" class="bt-input d-lvl" style="width: 30%; position:absolute; top:10px; right: 40px;" placeholder="Lvl"><textarea class="bt-textarea d-desc" rows="2" placeholder="Description..."></textarea><div class="bt-buffs-section" style="margin-top: 6px;"><div style="display: flex; align-items: center; gap: 5px; font-size: 12px; color: #888;"><span>Buffs/Debuffs</span><button class="bt-add-btn bt-add-buff" data-action="add-buff" style="font-size: 11px; padding: 2px 6px;">+ Add</button></div><div class="bt-buffs-container"></div></div>`
  return div
}

/**
 * Create a trait row with name, description, and a
 * buffs/debuffs section.
 */
export function createTraitItem(): HTMLElement {
  const div = document.createElement('div')
  div.className = 'bt-dynamic-item dyn-trait'
  div.innerHTML = `<button class="bt-remove-btn" data-action="remove-trait">✖</button><input type="text" class="bt-input full d-name" style="width: 80%;" placeholder="Trait Name"><textarea class="bt-textarea d-desc" rows="2" placeholder="Description..."></textarea><div class="bt-buffs-section" style="margin-top: 6px;"><div style="display: flex; align-items: center; gap: 5px; font-size: 12px; color: #888;"><span>Buffs/Debuffs</span><button class="bt-add-btn bt-add-buff" data-action="add-buff" style="font-size: 11px; padding: 2px 6px;">+ Add</button></div><div class="bt-buffs-container"></div></div>`
  return div
}

/**
 * Create an inventory item row with quantity, name, and remove button.
 */
export function createInvItem(): HTMLElement {
  const div = document.createElement('div')
  div.className = 'bt-row dyn-inv'
  div.style.cssText = 'margin-bottom: 5px; background: #222; padding: 5px; border-radius: 4px; border: 1px dashed #444;'
  div.innerHTML = `<input type="number" class="bt-input d-qty" style="width: 40px; text-align: center; padding: 4px;" placeholder="#" value="1"><input type="text" class="bt-input full d-name" style="margin-bottom: 0; flex: 1; margin-left: 5px;" placeholder="Item name..."><button data-action="remove-inv" style="background: transparent; border: none; color: #ff4444; cursor: pointer; font-size: 16px; margin-left: 5px;">✖</button>`
  return div
}
