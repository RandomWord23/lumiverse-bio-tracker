// Backend messaging helpers, RPC wrappers, and settings persistence
// for the Bio Tracker frontend. These functions are extracted from
// `src/frontend.ts` so the main setup module can stay focused on UI.

import type { SpindleFrontendContext } from 'lumiverse-spindle-types'
import type {
  ToastSettings,
  EngineToggles,
  UiSettings,
  BioTrackerSettings,
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
  errors: true,
  chatWarnings: false,
}

export const defaultEngineToggles: EngineToggles = {
  digestionEngine: true,
  clothingStress: true,
  nutrientAbsorption: true,
  arousalClimax: true,
  struggleEngine: true,
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
      }
    }
  } catch (e) {}
  return {
    toast: { ...defaultToastSettings },
    engine: { ...defaultEngineToggles },
    ui: { ...defaultUiSettings },
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
