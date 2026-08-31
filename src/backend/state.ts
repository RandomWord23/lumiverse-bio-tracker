export interface Snapshot {
  messageId: string
  sheetXml: string
  chatIndex: number
}

// ─── Shared mutable state ───────────────────────────────────
export let activeChatId: string | null = null
export let pendingGenerationType: string = 'normal'
export const sheets: Map<string, string> = new Map()
export const snapshots: Map<string, Snapshot[]> = new Map()
export const committedMessageIds: Set<string> = new Set()

// ─── Prompt-time sheet snapshot ─────────────────────────────
// Stores the exact sheet XML that was shown to the LLM in the most
// recent promptInterceptor call for a given chat.  This decouples
// contentProcessor and commitUpdate from the race condition with
// GENERATION_ENDED: they use the pre-generation sheet (the one the
// LLM actually saw) as the "old" sheet, not the potentially-already-
// updated sheets.get(chatId).
export const promptSheets: Map<string, string> = new Map()

// ─── Settings (received from frontend) ──────────────────────
export let toastSettings: Record<string, boolean> = {
  digestionTicks: true, climaxEvents: true, clothingDamage: true,
  nutrientAbsorption: false, digestionSkips: false, sheetSync: true,
  rollbackEvents: true, rollbackWarnings: true, errors: true, chatWarnings: false,
  struggleEvents: true, vomitEvents: true,
}
export let engineToggles: Record<string, boolean> = {
  digestionEngine: true, clothingStress: true, nutrientAbsorption: true, arousalClimax: true,
  struggleEngine: true, buffSystem: true,
  attributeSystem: false,
}

// ─── Setters (writes must go through these to reassign the live bindings) ──
export function setActiveChatId(value: string | null): void { activeChatId = value }
export function setPendingGenerationType(value: string): void { pendingGenerationType = value }
export function setToastSettings(value: Record<string, boolean>): void { toastSettings = value }
export function setEngineToggles(value: Record<string, boolean>): void { engineToggles = value }
