// Backend messaging helpers, RPC wrappers, and settings persistence
// for the Bio Tracker frontend. These functions are extracted from
// `src/frontend.ts` so the main setup module can stay focused on UI.

import type { SpindleFrontendContext } from 'lumiverse-spindle-types'
import type {
  ToastSettings,
  EngineToggles,
  UiSettings,
  BioTrackerSettings,
  DicePreset,
} from './types'

// ─── Default settings ──────────────────────────────────────────
export const defaultToastSettings: ToastSettings = {
  digestionTicks: true,
  climaxEvents: true,
  clothingDamage: true,
  nutrientAbsorption: false,
  digestionSkips: false,
  sheetSync: true,
  rollbackEvents: true,
  rollbackWarnings: true,
  struggleEvents: true,
  vomitEvents: true,
  lactationEvents: true,
  progressionEvents: true,
  questEvents: true,
  healthEvents: true,
  errors: true,
  chatWarnings: false,
}

export const defaultEngineToggles: EngineToggles = {
  digestionEngine: true,
  clothingStress: true,
  nutrientAbsorption: true,
  arousalClimax: true,
  struggleEngine: true,
  buffSystem: true,
  attributeSystem: false,
  healthSystem: false,
  diceSystem: false,
  unbirthEngine: false,
  cockVoreEngine: false,
  lactationEngine: false,
  progressionSystem: false,
  questSystem: false,
}

export const defaultUiSettings: UiSettings = {
  btnOpacity: 0.4,
  panelWidth: 350,
  autoOpen: false,
}

// ─── Settings persistence ──────────────────────────────────────
const SETTINGS_KEY = 'bio-tracker-settings'

export function loadSettings(): BioTrackerSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return {
        toast: { ...defaultToastSettings, ...(p.toast || {}) },
        engine: { ...defaultEngineToggles, ...(p.engine || {}) },
        ui: { ...defaultUiSettings, ...(p.ui || {}) },
        dicePresets: (p.dicePresets as DicePreset[] | undefined) ?? [],
      }
    }
  } catch (e) {}
  return {
    toast: { ...defaultToastSettings },
    engine: { ...defaultEngineToggles },
    ui: { ...defaultUiSettings },
    dicePresets: [],
  }
}

export function saveSettings(s: BioTrackerSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

// ─── Backend RPC wrappers ──────────────────────────────────────

export function sendSettingsToBackend(
  ctx: SpindleFrontendContext,
  s: BioTrackerSettings,
): void {
  ctx.sendToBackend({
    type: 'SETTINGS_UPDATED',
    toastSettings: s.toast,
    engineToggles: s.engine,
  })
}

export function sendSyncBioData(
  ctx: SpindleFrontendContext,
  xmlData: string,
): void {
  ctx.sendToBackend({ type: 'SYNC_BIO_DATA', xmlData })
}

export function sendGetLatestSheet(ctx: SpindleFrontendContext): void {
  ctx.sendToBackend({ type: 'GET_LATEST_SHEET' })
}

export function sendPopulateFields(
  ctx: SpindleFrontendContext,
  fields: string[],
  xml: string,
): void {
  ctx.sendToBackend({ type: 'POPULATE_FIELDS', fields, xml })
}

export function sendGetTheme(ctx: SpindleFrontendContext): void {
  ctx.sendToBackend({ type: 'GET_THEME' })
}

export function sendSpendAttributePoint(
  ctx: SpindleFrontendContext,
  attrKey: string,
): void {
  ctx.sendToBackend({ type: 'SPEND_ATTRIBUTE_POINT', attrKey })
}
