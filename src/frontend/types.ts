// UI state interfaces, component props, and payload types
// for the Bio Tracker frontend panel.

/**
 * Toast notification category settings. Each key toggles a category of
 * toast messages emitted by the backend.
 */
export interface ToastSettings {
  [key: string]: boolean
  digestionTicks: boolean
  climaxEvents: boolean
  clothingDamage: boolean
  nutrientAbsorption: boolean
  digestionSkips: boolean
  sheetSync: boolean
  rollbackEvents: boolean
  rollbackWarnings: boolean
  struggleEvents: boolean
  vomitEvents: boolean
  lactationEvents: boolean
  progressionEvents: boolean
  questEvents: boolean
  errors: boolean
  chatWarnings: boolean
}

/**
 * Engine feature toggle settings. Each key enables/disables a backend engine.
 */
export interface EngineToggles {
  [key: string]: boolean
  digestionEngine: boolean
  clothingStress: boolean
  nutrientAbsorption: boolean
  arousalClimax: boolean
  struggleEngine: boolean
  buffSystem: boolean
  attributeSystem: boolean
  healthSystem: boolean
  diceSystem: boolean
  unbirthEngine: boolean
  cockVoreEngine: boolean
  lactationEngine: boolean
  progressionSystem: boolean
  questSystem: boolean
}

/**
 * UI appearance/behavior settings.
 */
export interface UiSettings {
  btnOpacity: number
  panelWidth: number
  autoOpen: boolean
}

/**
 * Persisted settings bundle stored under the `bio-tracker-settings` key.
 */
export interface BioTrackerSettings {
  toast: ToastSettings
  engine: EngineToggles
  ui: UiSettings
  dicePresets?: DicePreset[]
}

/**
 * A single die configuration within a dice section.
 */
export interface DiceConfig {
  sides: number
  count: number
}

/**
 * A named section of dice (e.g. "Combat", "Social", "Magic").
 * Each section is an independent pool.
 */
export interface DiceSection {
  name: string
  dice: DiceConfig[]
}

/**
 * A saved preset of dice sections that can be loaded into the dice tab.
 */
export interface DicePreset {
  name: string
  sections: DiceSection[]
}

/**
 * Definition for a toast notification category row in the settings panel.
 */
export interface ToastCategoryDef {
  key: string
  label: string
  desc: string
}

/**
 * Definition for an engine feature toggle row in the settings panel.
 */
export interface EngineToggleDef {
  key: string
  label: string
  desc: string
}

/**
 * Definition for a buff target option in the buff entry dropdown.
 */
export interface BuffTargetDef {
  value: string
  label: string
}

/**
 * Theme information received from the backend via `spindle.theme.getCurrent()`.
 * Used to adapt the panel's colour tokens to the user's Lumiverse theme.
 */
export interface ThemeInfo {
  mode: 'light' | 'dark'
  accent: { h: number; s: number; l: number }
  fontScale: number
  radiusScale: number
}
