import type { SpindleFrontendContext } from 'lumiverse-spindle-types'
import { bioTrackerStylesheet, colorMap, condColors } from './frontend/styles'
import type {
  ToastSettings,
  EngineToggles,
  UiSettings,
  ToastCategoryDef,
  EngineToggleDef,
  BuffTargetDef,
  BioTrackerSettings,
  DicePreset,
  DiceSection,
  DiceConfig,
  ThemeInfo,
} from './frontend/types'
import {
  defaultToastSettings,
  defaultEngineToggles,
  defaultUiSettings,
  loadSettings,
  saveSettings,
  sendSettingsToBackend,
  sendSyncBioData,
  sendGetLatestSheet,
  sendPopulateFields,
  sendGetTheme,
} from './frontend/api'
import {
  buildToggleRow,
  createStomachItem,
  createWombItem,
  createBallsItem,
  createRemainsItem,
  createBuffEntry,
  createSkillItem,
  createTraitItem,
  createInvItem,
  createDiceSection,
  createDiceEntry,
} from './frontend/components'

export function setup(ctx: SpindleFrontendContext) {
  // ─── Styles ────────────────────────────────────────────────
  const removeStyle = ctx.dom.addStyle(bioTrackerStylesheet)

  // ─── Preview Modal ─────────────────────────────────────────
  const previewModal = document.createElement('div')
  previewModal.id = 'bt-preview-modal'
  previewModal.innerHTML = `
    <div id="bt-preview-header"><span>XML Data Output</span></div>
    <div id="bt-preview-content"></div>
    <button id="bt-preview-close">✖ Close Preview</button>
  `
  document.body.appendChild(previewModal)
  document.getElementById('bt-preview-close')?.addEventListener('click', () => {
    previewModal.style.display = 'none'
  })

  // ─── Panel ─────────────────────────────────────────────────
  const panel = document.createElement('div')
  panel.id = 'bio-tracker-panel'
  panel.innerHTML = `
    <div class="bt-header">
      <span>📋 Character Sheet</span>
      <span class="bt-close" id="bt-close-btn">✖</span>
    </div>
    <div class="bt-tabs">
      <button class="bt-tab-btn active" data-tab="tab-char">Character</button>
      <button class="bt-tab-btn" data-tab="tab-inv">Inventory</button>
      <button class="bt-tab-btn" data-tab="tab-state">State</button>
      <button class="bt-tab-btn" data-tab="tab-vitals">Metabolism</button>
      <button class="bt-tab-btn" data-tab="tab-dice">🎲</button>
      <button class="bt-tab-btn" data-tab="tab-settings">⚙️</button>
    </div>
    <div class="bt-content">
      <div id="tab-char" class="bt-tab-content active">
        <div class="bt-sub-tabs">
          <button class="bt-sub-btn active" data-sub="sub-app">Appearance</button>
          <button class="bt-sub-btn" data-sub="sub-skills">Skills & Traits</button>
          <button class="bt-sub-btn" data-sub="sub-attr">Attributes</button>
        </div>
        <div id="sub-app" class="bt-sub-content active">
          <div class="bt-section-title first">IDENTITY & BASE</div>
          <input type="text" class="bt-input full bt-scrape" data-id="Name" placeholder="Character Name" id="bt-name">
          <div class="bt-row"><span>Species:</span> <input type="text" class="bt-input bt-input-wide bt-scrape" data-id="Species" id="bt-species"></div>
          <div class="bt-row"><span>Age:</span> <input type="text" class="bt-input bt-input-wide bt-scrape" data-id="Age" id="bt-age"></div>
          <div class="bt-row">
            <span>Gender:</span>
            <div class="bt-gender-row">
              <div class="bt-gender-input-wrap">
                <input type="text" class="bt-input bt-scrape bt-gender-input" data-id="Gender" id="bt-gender">
              </div>
              <span id="bt-gender-icon" class="bt-gender-icon"></span>
            </div>
          </div>
          <div class="bt-row"><span>Pronouns:</span> <input type="text" class="bt-input bt-input-wide bt-scrape" data-id="Pronouns" id="bt-pronouns"></div>
          <div class="bt-row"><span>Voice:</span> <input type="text" class="bt-input bt-input-wide bt-scrape" data-id="Voice" id="bt-voice"></div>
          <div class="bt-row"><span>Scent:</span> <input type="text" class="bt-input bt-input-wide bt-scrape" data-id="Scent" id="bt-scent"></div>
          <div class="bt-section-title">HEAD & FACE</div>
          <div class="bt-row"><span>Hair:</span> <input type="text" class="bt-input bt-input-wide bt-scrape" data-id="Hair" id="bt-hair"></div>
          <div class="bt-row"><span>Eyes:</span> <input type="text" class="bt-input bt-input-wide bt-scrape" data-id="Eyes" id="bt-eyes"></div>
          <div class="bt-row"><span>Mouth:</span> <input type="text" class="bt-input bt-input-wide bt-scrape" data-id="Mouth" id="bt-mouth"></div>
          <div class="bt-row"><span>Skin:</span> <input type="text" class="bt-input bt-input-wide bt-scrape" data-id="Skin" id="bt-skin"></div>
          <div class="bt-row"><span>Makeup:</span> <input type="text" class="bt-input bt-input-wide bt-scrape" data-id="Makeup" id="bt-makeup"></div>
          <textarea class="bt-textarea bt-scrape" data-id="Features" rows="2" placeholder="Distinct facial features..." id="bt-features"></textarea>
          <div class="bt-section-title">BODY & ANATOMY</div>
          <div class="bt-row"><span>Build:</span> <input type="text" class="bt-input bt-input-wide bt-scrape" data-id="Build" placeholder="e.g. athletic, slender" id="bt-build"></div>
          <div class="bt-row"><span>Height (cm):</span> <input type="number" class="bt-input bt-scrape" data-id="Height_cm" id="bt-height" value="160"></div>
          <div class="bt-row"><span>Weight (kg):</span> <input type="number" class="bt-input bt-scrape" data-id="Weight_kg" id="bt-weight" value="60"></div>
          <div class="bt-row">
            <span>Breasts (ml):</span>
            <div class="bt-breast-row">
              <input type="number" class="bt-input bt-scrape bt-breast-ml" data-id="BreastVolume_ml" id="bt-breast-ml" value="0">
              <span id="bt-breast-cup" class="bt-breast-cup">AA</span>
            </div>
          </div>
          <input type="text" class="bt-input full bt-scrape" data-id="BreastShape" placeholder="Breast descriptor (e.g., firm, perky)" id="bt-breast-desc">
          <div class="bt-row"><span>Ass (Hips cm):</span> <input type="number" class="bt-input bt-input-wide bt-scrape" data-id="Hips_cm" id="bt-ass-cm" value="90"></div>
          <input type="text" class="bt-input full bt-scrape" data-id="AssShape" placeholder="Ass descriptor (e.g., plump, wide)" id="bt-ass-desc">
          <div class="bt-row"><span>Stomach Resist:</span> <input type="number" class="bt-input bt-input-wide bt-scrape" data-id="StomachResistance" id="bt-stomach-resist" step="0.1" value="1.0"></div>
          <div class="bt-row">
            <span>Penis (L/G cm):</span>
            <div class="bt-penis-row">
              <input type="number" class="bt-input bt-input-small bt-scrape" data-id="PenisLength_cm" placeholder="Len" id="bt-penis-len">
              <span class="bt-penis-x">x</span>
              <input type="number" class="bt-input bt-input-small bt-scrape" data-id="PenisGirth_cm" placeholder="Girth" id="bt-penis-girth">
            </div>
          </div>
          <input type="text" class="bt-input full bt-scrape" data-id="PenisShape" placeholder="Penis descriptor (e.g., uncut, veiny)" id="bt-penis-desc">
          <div class="bt-row"><span>Current Size (L/G cm):</span> <span class="bt-value bt-current-size" id="bt-penis-current">0.0 x 0.0</span></div>
          <div class="bt-row"><span>Vagina:</span> <input type="text" class="bt-input bt-input-wide bt-scrape" data-id="Vagina" placeholder="Descriptor..." id="bt-vagina"></div>
          <div class="bt-note">Markings & Scars:</div>
          <textarea class="bt-textarea bt-scrape" data-id="ScarsMarkings" rows="2" placeholder="Scars, Tattoos, Piercings..." id="bt-scars"></textarea>
        </div>
        <div id="sub-skills" class="bt-sub-content">
          <div class="bt-section-spacer">
            <div class="bt-row"><span class="bt-bold">Skills</span> <button class="bt-add-btn" id="add-skill-btn">+ Add</button></div>
            <div id="skills-container"></div>
          </div>
          <div>
            <div class="bt-row"><span class="bt-bold">Traits</span> <button class="bt-add-btn" id="add-trait-btn">+ Add</button></div>
            <div id="traits-container"></div>
          </div>
        </div>
        <div id="sub-attr" class="bt-sub-content">
          <div class="bt-section-title first">ATTRIBUTES</div>
          <div class="bt-hint">Range 1–20 (default 10). Modifier = ⌊(score−10)/2⌋. The extension applies modifiers automatically.</div>
          <div class="bt-row"><span>STR (Strength):</span> <div class="bt-attr-row"><input type="number" class="bt-input bt-attr bt-attr-input" data-attr="STR" min="1" max="20" value="10" id="bt-attr-str"><span class="bt-attr-mod" id="bt-attr-mod-str">+0</span></div></div>
          <div class="bt-row"><span>DEX (Dexterity):</span> <div class="bt-attr-row"><input type="number" class="bt-input bt-attr bt-attr-input" data-attr="DEX" min="1" max="20" value="10" id="bt-attr-dex"><span class="bt-attr-mod" id="bt-attr-mod-dex">+0</span></div></div>
          <div class="bt-row"><span>CON (Constitution):</span> <div class="bt-attr-row"><input type="number" class="bt-input bt-attr bt-attr-input" data-attr="CON" min="1" max="20" value="10" id="bt-attr-con"><span class="bt-attr-mod" id="bt-attr-mod-con">+0</span></div></div>
          <div class="bt-row"><span>INT (Intelligence):</span> <div class="bt-attr-row"><input type="number" class="bt-input bt-attr bt-attr-input" data-attr="INT" min="1" max="20" value="10" id="bt-attr-int"><span class="bt-attr-mod" id="bt-attr-mod-int">+0</span></div></div>
          <div class="bt-row"><span>WIS (Wisdom):</span> <div class="bt-attr-row"><input type="number" class="bt-input bt-attr bt-attr-input" data-attr="WIS" min="1" max="20" value="10" id="bt-attr-wis"><span class="bt-attr-mod" id="bt-attr-mod-wis">+0</span></div></div>
          <div class="bt-row"><span>CHA (Charisma):</span> <div class="bt-attr-row"><input type="number" class="bt-input bt-attr bt-attr-input" data-attr="CHA" min="1" max="20" value="10" id="bt-attr-cha"><span class="bt-attr-mod" id="bt-attr-mod-cha">+0</span></div></div>
          <div class="bt-section-title" style="margin-top: 15px;">DERIVED EFFECTS</div>
          <div class="bt-hint">
            <div>STR → Stomach Resistance</div>
            <div>DEX → Arousal Decay</div>
            <div>CON → Acid Rise Rate, Health Regen</div>
            <div>INT → Nutrient Absorption</div>
            <div>WIS → Indigestion Decay, Energy Regen</div>
            <div>CHA → Suppression</div>
          </div>
        </div>
      </div>
      <div id="tab-inv" class="bt-tab-content">
        <div class="bt-row">
          <span class="bt-accent-text">WEALTH</span>
          <select id="bt-currency-type" class="bt-select bt-scrape bt-currency-select" data-id="CurrencySystem">
            <option value="modern">Modern ($)</option>
            <option value="fantasy">Fantasy (G/S/C)</option>
          </select>
        </div>
        <div id="currency-modern"><input type="number" class="bt-input full bt-scrape" data-id="CashBalance" id="bt-cash-modern" placeholder="Balance (e.g. 1500)"></div>
        <div id="currency-fantasy" class="bt-currency-fantasy">
          <div class="bt-coin-row"><input type="number" class="bt-input bt-scrape bt-coin-input" data-id="Gold" placeholder="0"><span class="bt-coin-g">G</span></div>
          <div class="bt-coin-row"><input type="number" class="bt-input bt-scrape bt-coin-input" data-id="Silver" placeholder="0"><span class="bt-coin-s">S</span></div>
          <div class="bt-coin-row"><input type="number" class="bt-input bt-scrape bt-coin-input" data-id="Copper" placeholder="0"><span class="bt-coin-c">C</span></div>
        </div>
        <hr class="bt-divider">
        <div class="bt-section-title flex">
          CLOTHING SLOTS
          <select class="bt-select bt-scrape bt-cloth-mode" data-id="ClothingMode" id="bt-cloth-mode">
            <option value="flavor">Mode: Flavor</option>
            <option value="hardcore">Mode: Hardcore</option>
          </select>
        </div>
        <span class="slot-label">Head (Top)</span><input type="text" class="bt-input full bt-cloth-slot" data-slot="Head Top" placeholder="Hats, Helmets, Hoods">
        <span class="slot-label">Head (Face)</span><input type="text" class="bt-input full bt-cloth-slot" data-slot="Face" placeholder="Glasses, Goggles, Visors">
        <span class="slot-label">Head (Lower)</span><input type="text" class="bt-input full bt-cloth-slot" data-slot="Head Lower" placeholder="Masks, Bandanas">
        <span class="slot-label">Neck</span><input type="text" class="bt-input full bt-cloth-slot" data-slot="Neck" placeholder="Scarves, Gorgets, Chokers">
        <div class="flex-row"><span class="slot-label">Underwear (Top)</span><select class="bt-select bt-cloth-flex"><option value="rigid">Rigid</option><option value="standard">Standard</option><option value="stretchy" selected>Stretchy</option><option value="magic">Magic</option></select></div>
        <input type="text" class="bt-input full bt-cloth-slot" data-slot="Underwear Top" placeholder="Bra, Binder, Undershirt">
        <div class="flex-row"><span class="slot-label">Underwear (Bottom)</span><select class="bt-select bt-cloth-flex"><option value="rigid">Rigid</option><option value="standard">Standard</option><option value="stretchy" selected>Stretchy</option><option value="magic">Magic</option></select></div>
        <input type="text" class="bt-input full bt-cloth-slot" data-slot="Underwear Bottom" placeholder="Panties, Boxers, Loincloth">
        <div class="flex-row"><span class="slot-label">Torso (Layer 1 - Base)</span><select class="bt-select bt-cloth-flex"><option value="rigid">Rigid</option><option value="standard" selected>Standard</option><option value="stretchy">Stretchy</option><option value="magic">Magic</option></select></div>
        <input type="text" class="bt-input full bt-cloth-slot" data-slot="Torso Base" placeholder="T-shirt, Blouse, Gambeson">
        <div class="flex-row"><span class="slot-label">Torso (Layer 2 - Mid)</span><select class="bt-select bt-cloth-flex"><option value="rigid">Rigid</option><option value="standard" selected>Standard</option><option value="stretchy">Stretchy</option><option value="magic">Magic</option></select></div>
        <input type="text" class="bt-input full bt-cloth-slot" data-slot="Torso Mid" placeholder="Sweater, Vest, Chainmail">
        <div class="flex-row"><span class="slot-label">Torso (Layer 3 - Outer)</span><select class="bt-select bt-cloth-flex"><option value="rigid">Rigid</option><option value="standard" selected>Standard</option><option value="stretchy">Stretchy</option><option value="magic">Magic</option></select></div>
        <input type="text" class="bt-input full bt-cloth-slot" data-slot="Torso Outer" placeholder="Jacket, Coat, Cuirass">
        <div class="flex-row"><span class="slot-label">Torso (Layer 4 - Shell)</span><select class="bt-select bt-cloth-flex"><option value="rigid" selected>Rigid</option><option value="standard">Standard</option><option value="stretchy">Stretchy</option><option value="magic">Magic</option></select></div>
        <input type="text" class="bt-input full bt-cloth-slot" data-slot="Torso Shell" placeholder="Overcoat, Poncho, Power Armor">
        <span class="slot-label">Hands (Layer 1)</span><input type="text" class="bt-input full bt-cloth-slot" data-slot="Hands Base" placeholder="Inner Gloves, Wraps">
        <span class="slot-label">Hands (Layer 2)</span><input type="text" class="bt-input full bt-cloth-slot" data-slot="Hands Outer" placeholder="Gauntlets, Thick Gloves">
        <div class="flex-row"><span class="slot-label">Legs (Layer 1 - Base)</span><select class="bt-select bt-cloth-flex"><option value="rigid">Rigid</option><option value="standard" selected>Standard</option><option value="stretchy">Stretchy</option><option value="magic">Magic</option></select></div>
        <input type="text" class="bt-input full bt-cloth-slot" data-slot="Legs Base" placeholder="Jeans, Leggings, Trousers">
        <div class="flex-row"><span class="slot-label">Legs (Layer 2 - Outer)</span><select class="bt-select bt-cloth-flex"><option value="rigid" selected>Rigid</option><option value="standard">Standard</option><option value="stretchy">Stretchy</option><option value="magic">Magic</option></select></div>
        <input type="text" class="bt-input full bt-cloth-slot" data-slot="Legs Outer" placeholder="Greaves, Chaps, Snow Pants">
        <span class="slot-label">Feet (Layer 1)</span><input type="text" class="bt-input full bt-cloth-slot" data-slot="Feet Base" placeholder="Socks, Stockings">
        <span class="slot-label">Feet (Layer 2)</span><input type="text" class="bt-input full bt-cloth-slot" data-slot="Feet Outer" placeholder="Shoes, Boots, Sabatons">
        <span class="slot-label">Jewelry</span><input type="text" class="bt-input full bt-cloth-slot" data-slot="Jewelry" placeholder="Rings, Amulets, Bracelets">
        <span class="slot-label">Back</span><input type="text" class="bt-input full bt-cloth-slot" data-slot="Back" placeholder="Backpack, Cape, Quiver">
        <div class="flex-row"><span class="slot-label">Waist</span><select class="bt-select bt-cloth-flex"><option value="rigid" selected>Rigid</option><option value="standard">Standard</option><option value="stretchy">Stretchy</option><option value="magic">Magic</option></select></div>
        <input type="text" class="bt-input full bt-cloth-slot" data-slot="Waist" placeholder="Belt, Holster, Scabbard">
        <hr class="bt-divider">
        <div class="bt-section-title flex">
          <span>BACKPACK / POCKETS</span>
          <button class="bt-add-btn" id="add-inv-btn">+ Add Item</button>
        </div>
        <div id="inv-container" class="bt-container-spacer"></div>
      </div>
      <div id="tab-state" class="bt-tab-content">
        <div class="bt-section-title first">CORE STATS</div>
        <div class="bt-fillbar"><span class="bt-fillbar-label">Health</span><div class="bt-fillbar-track"><div id="bt-health-bar" class="bt-fillbar-fill tier-safe" style="width:100%"></div></div><span class="bt-fillbar-text"><input type="number" class="bt-input bt-scrape" data-id="Health" id="bt-health" value="100" style="width:60px;"> / 100</span><span class="bt-fillbar-status" id="bt-health-status">Healthy</span></div>
        <div class="bt-fillbar"><span class="bt-fillbar-label">Energy</span><div class="bt-fillbar-track"><div id="bt-energy-bar" class="bt-fillbar-fill tier-safe" style="width:100%"></div></div><span class="bt-fillbar-text"><input type="number" class="bt-input bt-scrape" data-id="Energy" id="bt-energy" value="100" style="width:60px;"> / 100</span><span class="bt-fillbar-status" id="bt-energy-status">Energetic</span></div>
        <div class="bt-section-title">VITALS</div>
        <div id="bt-arousal-slot" class="bt-slot-spacer"></div>
        <div id="bt-climax-slot" class="bt-slot-spacer"></div>
        <div class="bt-section-title">WORLD STATE</div>
        <div class="bt-row"><span>Time:</span> <input type="text" class="bt-input bt-input-wide bt-scrape" data-id="Time" id="bt-time" placeholder="14:30"></div>
        <div class="bt-row"><span>Weather:</span> <input type="text" class="bt-input bt-input-wide bt-scrape" data-id="Weather" id="bt-weather" placeholder="Rainy"></div>
        <div class="bt-row"><span>Temp:</span> <input type="text" class="bt-input bt-input-wide bt-scrape" data-id="Temperature" id="bt-temp" placeholder="15°C"></div>
        <div class="bt-section-title">LOCATION</div>
        <input type="text" class="bt-input full bt-scrape" data-id="Area" placeholder="Area (e.g. City Center)" id="bt-area">
        <input type="text" class="bt-input full bt-scrape" data-id="Building" placeholder="Building (e.g. The Rusty Tankard)" id="bt-building">
        <input type="text" class="bt-input full bt-scrape" data-id="Room" placeholder="Room (e.g. Back Alley)" id="bt-room">
      </div>
      <div id="tab-vitals" class="bt-tab-content">
        <div class="bt-section-title first">METABOLIC ENGINE</div>
        <div class="bt-row"><span>Acid Level (%):</span> <input type="number" class="bt-input bt-scrape" data-id="CurrentAcidPct" id="bt-acid-level" value="0"></div>
        <div class="bt-row"><span>Base Digestion (%/h):</span> <input type="number" class="bt-input bt-scrape" data-id="BaseDigestionRate" id="bt-dig-base" value="25"></div>
        <div class="bt-row"><span>Acid Rise (%/h):</span> <input type="number" class="bt-input bt-scrape" data-id="AcidRiseRate" id="bt-acid-rise" value="10"></div>
        <div class="bt-row"><span>Capacity Multiplier:</span> <input type="number" class="bt-input bt-scrape" data-id="CapacityMultiplier" id="bt-cap-mult" step="0.1" value="1.0"></div>
        <hr class="bt-divider">
        <div class="bt-fillbar thin"><span class="bt-fillbar-label">Belly</span><div class="bt-fillbar-track"><div id="bt-belly-bar" class="bt-fillbar-fill tier-neutral" style="width:0%"></div></div><span class="bt-fillbar-status" id="bt-belly-status">Flat</span></div>
        <div class="bt-fillbar thin"><span class="bt-fillbar-label">Move</span><div class="bt-fillbar-track"><div id="bt-mobility-bar" class="bt-fillbar-fill tier-safe" style="width:0%"></div></div><span class="bt-fillbar-status" id="bt-mobility">Agile / Normal</span></div>
        <hr class="bt-divider">
        <div class="bt-section-title flex">
          <span>STOMACH PIPELINE</span>
          <button class="bt-add-btn" id="add-stomach-btn">+ Add Item</button>
        </div>
        <div class="bt-fillbar"><span class="bt-fillbar-label">Stomach</span><div class="bt-fillbar-track"><div id="bt-stom-bar" class="bt-fillbar-fill tier-safe" style="width:0%"></div></div><span class="bt-fillbar-text"><span id="bt-stom-fill">0.00 L</span> / <span id="bt-stom-max-disp">115.20 L</span></span></div>
        <div class="bt-fillbar"><span class="bt-fillbar-label">Indigestion</span><div class="bt-fillbar-track"><div id="bt-indigestion-bar" class="bt-fillbar-fill tier-safe" style="width:0%"></div></div><span class="bt-fillbar-text" id="bt-indigestion-val">0%</span></div>
        <div class="bt-row" style="align-items:center;">
          <span>Suppressing:</span>
          <label class="bt-suppress-label">
            <input type="checkbox" id="bt-suppressing-toggle" class="bt-suppress-toggle">
            <span id="bt-suppressing-label" class="bt-suppress-text">Passive</span>
          </label>
          <span class="bt-fatigue-info" id="bt-fatigue-info"></span>
        </div>
        <div class="bt-fillbar thin"><span class="bt-fillbar-label">Struggle</span><div class="bt-fillbar-track"><div id="bt-struggle-bar" class="bt-fillbar-fill tier-safe" style="width:0%"></div></div><span class="bt-fillbar-status" id="bt-struggle-risk">None</span></div>
        <div class="bt-struggle-detail" id="bt-struggle-detail"></div>
        <div id="stomach-container" class="bt-container-spacer"></div>
        <hr class="bt-divider">
        <div class="bt-section-title flex">
          <span>BOWEL PIPELINE</span>
          <button class="bt-add-btn bt-zone-remains" id="add-remains-btn">+ Remains</button>
        </div>
        <div class="bt-fillbar zone-remains"><span class="bt-fillbar-label">Bowels</span><div class="bt-fillbar-track"><div id="bt-bowel-bar" class="bt-fillbar-fill tier-zone-remains" style="width:0%"></div></div><span class="bt-fillbar-text"><span id="bt-bowel-fill">0.00 L</span> / <span id="bt-bowel-max-disp">40.32 L</span></span></div>
        <div id="bowel-container" class="bt-container-spacer"></div>
        <hr class="bt-divider">
        <div class="bt-section-title flex">
          <span>WOMB</span>
          <button class="bt-add-btn bt-zone-womb" id="add-womb-btn">+ Add Prey</button>
        </div>
        <div class="bt-row"><span>Womb Capacity Multiplier:</span> <input type="number" class="bt-input bt-scrape" data-id="WombCapacityMultiplier" id="bt-womb-cap-mult" step="0.1" value="1.0"></div>
        <div class="bt-fillbar zone-womb"><span class="bt-fillbar-label">Womb</span><div class="bt-fillbar-track"><div id="bt-womb-bar" class="bt-fillbar-fill tier-zone-womb" style="width:0%"></div></div><span class="bt-fillbar-text"><span id="bt-womb-fill">0.00 L</span> / <span id="bt-womb-max-disp">0.00 L</span></span></div>
        <div id="womb-container" class="bt-container-spacer"></div>
        <hr class="bt-divider">
        <div class="bt-section-title flex">
          <span>BALLS</span>
          <button class="bt-add-btn bt-zone-balls" id="add-balls-btn">+ Add Prey</button>
        </div>
        <div class="bt-row"><span>Balls Capacity Multiplier:</span> <input type="number" class="bt-input bt-scrape" data-id="BallsCapacityMultiplier" id="bt-balls-cap-mult" step="0.1" value="1.0"></div>
        <div class="bt-fillbar zone-balls"><span class="bt-fillbar-label">Balls</span><div class="bt-fillbar-track"><div id="bt-balls-bar" class="bt-fillbar-fill tier-zone-balls" style="width:0%"></div></div><span class="bt-fillbar-text"><span id="bt-balls-fill">0.00 L</span> / <span id="bt-balls-max-disp">0.00 L</span></span></div>
        <div class="bt-fillbar"><span class="bt-fillbar-label">Cum</span><div class="bt-fillbar-track"><div id="bt-cum-bar" class="bt-fillbar-fill tier-climax" style="width:0%"></div></div><span class="bt-fillbar-text" id="bt-cum-vol">0 ml</span></div>
        <div id="balls-container" class="bt-container-spacer"></div>
        <hr class="bt-divider">
        <div class="bt-section-title flex">
          <span>LACTATION</span>
        </div>
        <div class="bt-row"><span>Lactation Rate Multiplier:</span> <input type="number" class="bt-input bt-scrape" data-id="LactationRateMultiplier" id="bt-lact-rate-mult" step="0.1" value="1.0"> <span id="bt-lact-rate-display" class="bt-lact-display">20 ml/h</span></div>
        <div class="bt-fillbar thin"><span class="bt-fillbar-label">Milk</span><div class="bt-fillbar-track"><div id="bt-milk-bar" class="bt-fillbar-fill tier-neutral" style="width:0%"></div></div><span class="bt-fillbar-text"><span id="bt-milk-ml-text">0</span> / <span id="bt-milk-cap">0 ml</span></span><span class="bt-fillbar-status" id="bt-milk-status">Empty</span></div>
        <div class="bt-row"><span>Current Milk:</span> <input type="number" class="bt-input bt-scrape bt-milk-input" data-id="MilkVolume_ml" id="bt-milk-ml" value="0"></div>
        <div class="bt-row"><span>Production Rate:</span> <span class="bt-value" id="bt-milk-rate">0 ml/h</span></div>
        <div class="bt-row"><span>Womb Boost:</span> <span class="bt-value" id="bt-milk-boost">1.0×</span></div>
        <hr class="bt-divider">
        <button class="bt-action-btn" id="bt-sync-btn">💾 Sync Changes to AI</button>
        <button class="bt-action-btn secondary" id="bt-sync-chat-btn">🔄 Sync from Latest Message</button>
        <button class="bt-action-btn secondary" id="bt-populate-btn">✨ Populate Flagged Fields</button>
      </div>
      <div id="tab-dice" class="bt-tab-content">
        <div class="bt-section-title first">🎲 DICE POOLS</div>
        <div class="bt-hint">Create named sections of dice (e.g. Combat, Social, Magic). Each section is an independent pool. Dice are pre-rolled every turn and injected into the AI prompt. The AI consumes them via <code><action_roll></code> tags. If the AI doesn't use them, they are silently discarded.</div>
        <div class="bt-dice-preset-bar">
          <select class="bt-dice-preset-select" id="bt-dice-preset-select">
            <option value="">— Presets —</option>
          </select>
          <button class="bt-dice-preset-btn" id="bt-dice-load-preset">📂 Load</button>
          <button class="bt-dice-preset-btn" id="bt-dice-save-preset">💾 Save</button>
          <button class="bt-dice-preset-btn" id="bt-dice-delete-preset">🗑 Delete</button>
        </div>
        <div class="bt-dice-toolbar">
          <button class="bt-add-btn" id="add-dice-section-btn">+ Add Section</button>
        </div>
        <div class="bt-dice-empty-hint" id="bt-dice-empty-hint">No dice sections yet. Click "Add Section" to create one.</div>
        <div id="dice-sections-container"></div>
      </div>
      <div id="tab-settings" class="bt-tab-content">
        <div class="bt-section-title first">🔔 TOAST ALERTS</div>
        <div id="bt-toast-settings"></div>
        <hr class="bt-divider">
        <div class="bt-section-title">⚙️ ENGINE TOGGLES</div>
        <div id="bt-engine-settings"></div>
        <hr class="bt-divider">
        <div class="bt-section-title">🎨 UI SETTINGS</div>
        <div class="bt-slider-row">
          <span>Btn Opacity:</span>
          <input type="range" id="bt-set-opacity" min="0.2" max="1" step="0.1" value="0.4">
          <span class="bt-slider-val" id="bt-set-opacity-val">0.4</span>
        </div>
        <div class="bt-slider-row">
          <span>Panel Width:</span>
          <input type="range" id="bt-set-width" min="300" max="500" step="10" value="350">
          <span class="bt-slider-val" id="bt-set-width-val">350px</span>
        </div>
        <div class="bt-toggle-row">
          <div>
            <div class="bt-toggle-label">Auto-open panel on update</div>
            <div class="bt-toggle-desc">Open panel when sheet update arrives</div>
          </div>
          <div class="bt-switch" id="bt-set-autoopen" data-setting="autoOpen"></div>
        </div>
        <button class="bt-reset-btn" id="bt-set-reset-pos">📍 Reset Button Position</button>
        <hr class="bt-divider">
        <button class="bt-reset-btn danger" id="bt-set-reset-all">↺ Reset All Settings to Defaults</button>
      </div>
    </div>
  `
  document.body.appendChild(panel)

  // ─── Settings System ───────────────────────────────────────
  const toastCategoryDefs: ToastCategoryDef[] = [
    { key: 'digestionTicks', label: 'Digestion Ticks', desc: 'Sheet updated, digestion tick applied' },
    { key: 'climaxEvents', label: 'Climax Events', desc: 'Climax reached, resetting next turn' },
    { key: 'clothingDamage', label: 'Clothing Damage', desc: 'Clothes degraded from body growth' },
    { key: 'nutrientAbsorption', label: 'Nutrient Absorption', desc: 'Body grew from digestion' },
    { key: 'digestionSkips', label: 'Digestion Skips', desc: 'Tick skipped (no time, rollback, etc.)' },
    { key: 'sheetSync', label: 'Sheet Sync', desc: 'Character sheet synced' },
    { key: 'rollbackEvents', label: 'Rollback Events', desc: 'Sheet restored/cleared on delete' },
    { key: 'rollbackWarnings', label: 'Rollback Warnings', desc: 'No snapshot found warnings' },
    { key: 'struggleEvents', label: 'Struggle Events', desc: 'Indigestion thresholds and prey struggling' },
    { key: 'vomitEvents', label: 'Vomit Events', desc: 'Prey escape during vomit events' },
    { key: 'lactationEvents', label: 'Lactation Events', desc: 'Milk production, fullness, and leaking notifications' },
    { key: 'errors', label: 'Errors', desc: 'Populate failed and other errors' },
    { key: 'chatWarnings', label: 'Chat Warnings', desc: 'Open a chat first warnings' },
  ]
  const engineToggleDefs: EngineToggleDef[] = [
    { key: 'digestionEngine', label: 'Digestion Engine', desc: 'Master switch for digestion ticks' },
    { key: 'clothingStress', label: 'Clothing Stress', desc: 'Clothing degradation in hardcore mode' },
    { key: 'nutrientAbsorption', label: 'Nutrient Absorption', desc: 'Body growth from digested items' },
    { key: 'arousalClimax', label: 'Arousal and Climax', desc: 'Arousal decay and climax meter' },
    { key: 'struggleEngine', label: 'Struggle Engine', desc: 'Prey struggling, indigestion, and vomit events' },
    { key: 'buffSystem', label: 'Buff System', desc: 'Apply skill/trait percentage buffs to stats' },
    { key: 'attributeSystem', label: 'Attribute System', desc: 'Apply STR/DEX/CON/INT/WIS/CHA modifiers to engine stats' },
    { key: 'diceSystem', label: 'Dice System', desc: 'Pre-roll dice pools for action resolution' },
    { key: 'unbirthEngine', label: 'Unbirth Engine', desc: 'Womb absorption of prey (same nutrient absorption as stomach)' },
    { key: 'cockVoreEngine', label: 'Cock Vore Engine', desc: 'Balls conversion of prey into cum, expelled on climax' },
    { key: 'lactationEngine', label: 'Lactation Engine', desc: 'Milk production, accumulation, and overcapacity leaking' },
  ]
  const buffTargetDefs: BuffTargetDef[] = [
    { value: 'BaseDigestionRate', label: 'Digestion Rate' },
    { value: 'AcidRiseRate', label: 'Acid Rise Rate' },
    { value: 'StomachResistance', label: 'Stomach Resistance' },
    { value: 'ArousalDecay', label: 'Arousal Decay' },
    { value: 'ArousalGain', label: 'Arousal Gain' },
    { value: 'NutrientAbsorption', label: 'Nutrient Absorption' },
    { value: 'ClothingStress', label: 'Clothing Stress' },
    { value: 'EnergyDrain', label: 'Energy Drain' },
    { value: 'WombAbsorptionRate', label: 'Womb Absorption Rate' },
    { value: 'BallsConversionRate', label: 'Balls Conversion Rate' },
    { value: 'LactationRate', label: 'Lactation Rate' },
  ]
  function applyUiSettings(ui: UiSettings) {
    const pe = document.getElementById('bio-tracker-panel') as HTMLElement
    if (pe) pe.style.width = ui.panelWidth + 'px'
    if (floatingBtn) { floatingBtn.style.opacity = String(ui.btnOpacity); clearTimeout(fadeTimeout); fadeTimeout = setTimeout(() => { floatingBtn.style.opacity = String(ui.btnOpacity) }, 3000) }
  }
  let currentSettings = loadSettings()
  const toastContainer = document.getElementById('bt-toast-settings')
  if (toastContainer) toastCategoryDefs.forEach((d) => toastContainer.appendChild(buildToggleRow(d, 'toast', currentSettings, ctx)))
  const engineContainer = document.getElementById('bt-engine-settings')
  if (engineContainer) engineToggleDefs.forEach((d) => engineContainer.appendChild(buildToggleRow(d, 'engine', currentSettings, ctx)))
  const opacitySlider = document.getElementById('bt-set-opacity') as HTMLInputElement
  const opacityVal = document.getElementById('bt-set-opacity-val')
  if (opacitySlider) {
    opacitySlider.value = String(currentSettings.ui.btnOpacity)
    if (opacityVal) opacityVal.textContent = String(currentSettings.ui.btnOpacity)
    opacitySlider.addEventListener('input', () => {
      const v = parseFloat(opacitySlider.value)
      currentSettings.ui.btnOpacity = v
      if (opacityVal) opacityVal.textContent = String(v)
      saveSettings(currentSettings)
      applyUiSettings(currentSettings.ui)
    })
  }
  const widthSlider = document.getElementById('bt-set-width') as HTMLInputElement
  const widthVal = document.getElementById('bt-set-width-val')
  if (widthSlider) {
    widthSlider.value = String(currentSettings.ui.panelWidth)
    if (widthVal) widthVal.textContent = currentSettings.ui.panelWidth + 'px'
    widthSlider.addEventListener('input', () => {
      const v = parseInt(widthSlider.value)
      currentSettings.ui.panelWidth = v
      if (widthVal) widthVal.textContent = v + 'px'
      saveSettings(currentSettings)
      applyUiSettings(currentSettings.ui)
    })
  }
  const autoOpenSwitch = document.getElementById('bt-set-autoopen')
  if (autoOpenSwitch) {
    autoOpenSwitch.classList.toggle('on', currentSettings.ui.autoOpen)
    autoOpenSwitch.addEventListener('click', () => {
      currentSettings.ui.autoOpen = !currentSettings.ui.autoOpen
      autoOpenSwitch.classList.toggle('on', currentSettings.ui.autoOpen)
      saveSettings(currentSettings)
    })
  }
  document.getElementById('bt-set-reset-pos')?.addEventListener('click', () => {
    localStorage.removeItem('bio-tracker-btn-pos')
    floatingBtn.style.left = ''; floatingBtn.style.top = ''
    floatingBtn.style.bottom = '80px'; floatingBtn.style.right = '20px'
    resetFade()
  })
  document.getElementById('bt-set-reset-all')?.addEventListener('click', () => {
    currentSettings = { toast: { ...defaultToastSettings }, engine: { ...defaultEngineToggles }, ui: { ...defaultUiSettings } }
    saveSettings(currentSettings)
    sendSettingsToBackend(ctx, currentSettings)
    if (toastContainer) { toastContainer.innerHTML = ''; toastCategoryDefs.forEach((d) => toastContainer.appendChild(buildToggleRow(d, 'toast', currentSettings, ctx))) }
    if (engineContainer) { engineContainer.innerHTML = ''; engineToggleDefs.forEach((d) => engineContainer.appendChild(buildToggleRow(d, 'engine', currentSettings, ctx))) }
    if (opacitySlider) { opacitySlider.value = '0.4'; if (opacityVal) opacityVal.textContent = '0.4' }
    if (widthSlider) { widthSlider.value = '350'; if (widthVal) widthVal.textContent = '350px' }
    if (autoOpenSwitch) autoOpenSwitch.classList.remove('on')
    applyUiSettings(currentSettings.ui)
  })
  sendSettingsToBackend(ctx, currentSettings)

  // ─── Floating Button ───────────────────────────────────────
  const floatingBtn = document.createElement('div')
  floatingBtn.id = 'bt-floating-btn'
  floatingBtn.innerText = '📋'

  const savedPos = localStorage.getItem('bio-tracker-btn-pos')
  if (savedPos) {
    try {
      const pos = JSON.parse(savedPos)
      floatingBtn.style.bottom = 'auto'
      floatingBtn.style.right = 'auto'
      floatingBtn.style.left = pos.x + 'px'
      floatingBtn.style.top = pos.y + 'px'
    } catch (e) {}
  }
  document.body.appendChild(floatingBtn)

  // ─── Host theme integration ────────────────────────────────
  // Request the user's Lumiverse theme from the backend.  The
  // response arrives asynchronously via `ctx.onBackendMessage`.
  sendGetTheme(ctx)

  /**
   * Apply the host theme to the panel, floating button, and preview
   * modal.  Toggles the `.bt-light` class for light mode and derives
   * the accent colour from the theme's HSL accent value.
   */
  function applyTheme(theme: ThemeInfo) {
    const targets = [panel, floatingBtn, previewModal]
    const isLight = theme.mode === 'light'
    for (const el of targets) {
      el.classList.toggle('bt-light', isLight)
    }
    // Derive accent from HSL and override the --bt-accent token
    const accentColor = `hsl(${theme.accent.h}, ${theme.accent.s}%, ${theme.accent.l}%)`
    for (const el of targets) {
      el.style.setProperty('--bt-accent', accentColor)
    }
    // Apply font scale if the host theme specifies a non-default scale
    if (theme.fontScale && theme.fontScale !== 1) {
      panel.style.fontSize = `calc(13px * ${theme.fontScale})`
    }
  }

  let fadeTimeout: any
  const resetFade = () => {
    floatingBtn.style.opacity = '1'
    clearTimeout(fadeTimeout)
    fadeTimeout = setTimeout(() => { floatingBtn.style.opacity = '0.4' }, 3000)
  }
  resetFade()
  applyUiSettings(currentSettings.ui)

  let isDragging = false
  let hasMoved = false
  let startX = 0
  let startY = 0
  let initialLeft = 0
  let initialTop = 0

  floatingBtn.addEventListener('touchstart', (e) => {
    isDragging = true; hasMoved = false; resetFade()
    const touch = e.touches[0]
    const rect = floatingBtn.getBoundingClientRect()
    startX = touch.clientX; startY = touch.clientY
    initialLeft = rect.left; initialTop = rect.top
    floatingBtn.style.bottom = 'auto'; floatingBtn.style.right = 'auto'
    floatingBtn.style.left = initialLeft + 'px'; floatingBtn.style.top = initialTop + 'px'
  }, { passive: true })

  document.addEventListener('touchmove', (e) => {
    if (!isDragging) return
    const touch = e.touches[0]
    if (Math.abs(touch.clientX - startX) > 5 || Math.abs(touch.clientY - startY) > 5) hasMoved = true
    floatingBtn.style.left = Math.max(0, Math.min(window.innerWidth - 45, initialLeft + (touch.clientX - startX))) + 'px'
    floatingBtn.style.top = Math.max(0, Math.min(window.innerHeight - 45, initialTop + (touch.clientY - startY))) + 'px'
  }, { passive: true })

  document.addEventListener('touchend', () => {
    if (isDragging) {
      localStorage.setItem('bio-tracker-btn-pos', JSON.stringify({
        x: parseFloat(floatingBtn.style.left), y: parseFloat(floatingBtn.style.top)
      }))
    }
    isDragging = false; resetFade()
  })

  floatingBtn.addEventListener('click', () => {
    if (!hasMoved) {
      panel.classList.add('open')
      floatingBtn.style.display = 'none'
    }
  })

  document.getElementById('bt-close-btn')?.addEventListener('click', () => {
    panel.classList.remove('open')
    floatingBtn.style.display = 'flex'
    resetFade()
  })

  // ─── Tab switching ─────────────────────────────────────────
  panel.querySelectorAll('.bt-tab-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      panel.querySelectorAll('.bt-tab-btn, .bt-tab-content').forEach((el) => el.classList.remove('active'))
      ;(e.target as HTMLElement).classList.add('active')
      document.getElementById((e.target as HTMLElement).dataset.tab!)?.classList.add('active')
    })
  })

  panel.querySelectorAll('.bt-sub-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      panel.querySelectorAll('.bt-sub-btn, .bt-sub-content').forEach((el) => el.classList.remove('active'))
      ;(e.target as HTMLElement).classList.add('active')
      document.getElementById((e.target as HTMLElement).dataset.sub!)?.classList.add('active')
    })
  })

  // ─── Attribute modifier display ─────────────────────────────
  function updateAttrModDisplay(attrKey: string) {
    const input = document.getElementById('bt-attr-' + attrKey.toLowerCase()) as HTMLInputElement
    const span = document.getElementById('bt-attr-mod-' + attrKey.toLowerCase())
    if (!input || !span) return
    const score = parseInt(input.value) || 10
    const mod = Math.floor((score - 10) / 2)
    const sign = mod >= 0 ? '+' : ''
    span.textContent = sign + mod
    span.style.color = mod > 0 ? '#44ff44' : mod < 0 ? '#ff4444' : '#aaa'
  }
  document.querySelectorAll('.bt-attr').forEach((el) => {
    el.addEventListener('input', () => {
      const attrKey = (el as HTMLInputElement).dataset.attr
      if (attrKey) updateAttrModDisplay(attrKey)
    })
  })

  // ─── Currency toggle ───────────────────────────────────────
  const currencyType = document.getElementById('bt-currency-type') as HTMLSelectElement
  currencyType?.addEventListener('change', () => {
    const modern = document.getElementById('currency-modern')
    const fantasy = document.getElementById('currency-fantasy')
    if (modern) modern.style.display = currencyType.value === 'modern' ? 'block' : 'none'
    if (fantasy) fantasy.style.display = currencyType.value === 'fantasy' ? 'flex' : 'none'
  })

  // ─── Capacity calculator ───────────────────────────────────
  function updateCapacities() {
    const heightEl = document.getElementById('bt-height') as HTMLInputElement
    const weightEl = document.getElementById('bt-weight') as HTMLInputElement
    const multEl = document.getElementById('bt-cap-mult') as HTMLInputElement
    if (!heightEl || !weightEl || !multEl) return

    const height = parseFloat(heightEl.value) || 160
    const weight = parseFloat(weightEl.value) || 60
    const mult = parseFloat(multEl.value) || 1.0

    const baseStomMax = height * weight * 0.012 * mult
    const baseBowelMax = baseStomMax * 0.35

    const stomMaxDisp = document.getElementById('bt-stom-max-disp')
    if (stomMaxDisp) stomMaxDisp.innerText = baseStomMax.toFixed(2) + ' L'
    const bowelMaxDisp = document.getElementById('bt-bowel-max-disp')
    if (bowelMaxDisp) bowelMaxDisp.innerText = baseBowelMax.toFixed(2) + ' L'

    let stomTotal = 0
    document.querySelectorAll('.stomach-vol').forEach((el) => {
      stomTotal += parseFloat((el as HTMLInputElement).value) || 0
    })
    const stomFillEl = document.getElementById('bt-stom-fill')
    if (stomFillEl) stomFillEl.innerText = stomTotal.toFixed(2) + ' L'
    const stomBar = document.getElementById('bt-stom-bar')
    if (stomBar) {
      const spct = baseStomMax > 0 ? Math.min((stomTotal / baseStomMax) * 100, 100) : 0
      stomBar.style.width = spct + '%'
      stomBar.classList.remove('overflow')
      if (stomTotal > baseStomMax) stomBar.classList.add('overflow')
    }

    let bowelTotal = 0
    document.querySelectorAll('.bowel-vol').forEach((el) => {
      bowelTotal += parseFloat((el as HTMLInputElement).value) || 0
    })
    const bowelFillEl = document.getElementById('bt-bowel-fill')
    if (bowelFillEl) bowelFillEl.innerText = bowelTotal.toFixed(2) + ' L'
    const bowelBar = document.getElementById('bt-bowel-bar')
    if (bowelBar) {
      const bpct = baseBowelMax > 0 ? Math.min((bowelTotal / baseBowelMax) * 100, 100) : 0
      bowelBar.style.width = bpct + '%'
      bowelBar.classList.remove('overflow')
      if (bowelTotal > baseBowelMax) bowelBar.classList.add('overflow')
    }

    // ─── Womb capacity ──────────────────────────────────────────
    const wombMultEl = document.getElementById('bt-womb-cap-mult') as HTMLInputElement
    const wombMult = parseFloat(wombMultEl?.value || '1.0') || 1.0
    const wombMax = height * weight * 0.012 * wombMult * 0.7
    const wombMaxDisp = document.getElementById('bt-womb-max-disp')
    if (wombMaxDisp) wombMaxDisp.innerText = wombMax.toFixed(2) + ' L'

    let wombTotal = 0
    document.querySelectorAll('.womb-vol').forEach((el) => {
      wombTotal += parseFloat((el as HTMLInputElement).value) || 0
    })
    const wombFillEl = document.getElementById('bt-womb-fill')
    if (wombFillEl) wombFillEl.innerText = wombTotal.toFixed(2) + ' L'
    const wombBar = document.getElementById('bt-womb-bar')
    if (wombBar) {
      const wpct = wombMax > 0 ? Math.min((wombTotal / wombMax) * 100, 100) : 0
      wombBar.style.width = wpct + '%'
      wombBar.classList.remove('overflow')
      if (wombTotal > wombMax) wombBar.classList.add('overflow')
    }

    // ─── Balls capacity ─────────────────────────────────────────
    const ballsMultEl = document.getElementById('bt-balls-cap-mult') as HTMLInputElement
    const ballsMult = parseFloat(ballsMultEl?.value || '1.0') || 1.0
    const penisL = parseFloat((document.getElementById('bt-penis-len') as HTMLInputElement)?.value || '0') || 0
    const penisG = parseFloat((document.getElementById('bt-penis-girth') as HTMLInputElement)?.value || '0') || 0
    const ballsMax = penisL * penisG * 0.05 * ballsMult
    const ballsMaxDisp = document.getElementById('bt-balls-max-disp')
    if (ballsMaxDisp) ballsMaxDisp.innerText = ballsMax.toFixed(2) + ' L'

    let ballsTotal = 0
    document.querySelectorAll('.balls-vol').forEach((el) => {
      ballsTotal += parseFloat((el as HTMLInputElement).value) || 0
    })
    const ballsFillEl = document.getElementById('bt-balls-fill')
    if (ballsFillEl) ballsFillEl.innerText = ballsTotal.toFixed(2) + ' L'
    const ballsBar = document.getElementById('bt-balls-bar')
    if (ballsBar) {
      const bpct = ballsMax > 0 ? Math.min((ballsTotal / ballsMax) * 100, 100) : 0
      ballsBar.style.width = bpct + '%'
      ballsBar.classList.remove('overflow')
      if (ballsTotal > ballsMax) ballsBar.classList.add('overflow')
    }
    const cumVolTxt = document.getElementById('bt-cum-vol')?.textContent || '0 ml'
    const cumVolVal = parseFloat(cumVolTxt.replace(/[^\d.]/g, '')) || 0
    const cumBar = document.getElementById('bt-cum-bar')
    if (cumBar) {
      const cumMaxMl = ballsMax * 1000
      const cpct = cumMaxMl > 0 ? Math.min((cumVolVal / cumMaxMl) * 100, 100) : 0
      cumBar.style.width = cpct + '%'
    }

    // ─── Milk capacity ──────────────────────────────────────────
    const lactRateMultEl = document.getElementById('bt-lact-rate-mult') as HTMLInputElement
    const lactRateMult = parseFloat(lactRateMultEl?.value || '1.0') || 1.0
    const breastMl = parseFloat((document.getElementById('bt-breast-ml') as HTMLInputElement)?.value || '0') || 0
    const milkCapacity = breastMl * 0.8
    const milkCapDisp = document.getElementById('bt-milk-cap')
    if (milkCapDisp) milkCapDisp.innerText = milkCapacity.toFixed(0) + ' ml'

    const milkInput = document.getElementById('bt-milk-ml') as HTMLInputElement
    const milkVol = parseFloat(milkInput?.value || '0') || 0
    const milkMlText = document.getElementById('bt-milk-ml-text')
    if (milkMlText) milkMlText.textContent = milkVol.toFixed(0)
    const milkBar = document.getElementById('bt-milk-bar')
    if (milkBar) {
      milkBar.classList.remove('tier-safe', 'tier-mild', 'tier-warn', 'tier-high', 'tier-crit', 'tier-neutral', 'overflow')
      if (breastMl <= 0) { milkBar.classList.add('tier-neutral') }
      else {
        const mpct = milkCapacity > 0 ? Math.min((milkVol / milkCapacity) * 100, 100) : 0
        milkBar.style.width = mpct + '%'
        if (milkVol > milkCapacity) milkBar.classList.add('overflow')
        else if (milkVol >= milkCapacity * 0.95) milkBar.classList.add('tier-mild')
        else if (milkVol > 0) milkBar.classList.add('tier-safe')
        else milkBar.classList.add('tier-neutral')
      }
    }
    const milkStatusEl = document.getElementById('bt-milk-status')
    if (milkStatusEl) {
      milkStatusEl.classList.remove('tier-safe', 'tier-mild', 'tier-warn', 'tier-high', 'tier-crit', 'tier-neutral')
      if (breastMl <= 0) { milkStatusEl.innerText = 'N/A'; milkStatusEl.classList.add('tier-neutral') }
      else if (milkVol <= 0) { milkStatusEl.innerText = 'Empty'; milkStatusEl.classList.add('tier-neutral') }
      else if (milkVol >= milkCapacity * 0.95 && milkVol <= milkCapacity) { milkStatusEl.innerText = 'Full'; milkStatusEl.classList.add('tier-mild') }
      else if (milkVol > milkCapacity) { milkStatusEl.innerText = 'Leaking'; milkStatusEl.classList.add('tier-crit') }
      else { milkStatusEl.innerText = 'Filling'; milkStatusEl.classList.add('tier-safe') }
    }

    // Production rate (without womb boost — actual boost computed in backend)
    const baseRate = 20.0
    const milkRate = breastMl > 0 ? baseRate * Math.sqrt(breastMl / 150) * lactRateMult : 0
    const milkRateDisp = document.getElementById('bt-milk-rate')
    if (milkRateDisp) milkRateDisp.innerText = milkRate.toFixed(1) + ' ml/h'

    // Live ml/h display next to the multiplier input — updates immediately on multiplier change
    const lactRateDisplay = document.getElementById('bt-lact-rate-display')
    if (lactRateDisplay) {
      const displayRate = breastMl > 0 ? baseRate * Math.sqrt(breastMl / 150) * lactRateMult : 0
      lactRateDisplay.innerText = displayRate.toFixed(1) + ' ml/h'
    }

    // Womb boost display
    let wombPreyForMilk = 0
    document.querySelectorAll('#womb-container .vital-slot').forEach((el) => {
      const type = (el.querySelector('.v-type') as HTMLSelectElement)?.value
      if (type === 'Prey') wombPreyForMilk++
    })
    const wombBoost = 1 + (wombPreyForMilk * 0.5)
    const milkBoostDisp = document.getElementById('bt-milk-boost')
    if (milkBoostDisp) milkBoostDisp.innerText = wombBoost.toFixed(1) + '×'

    const stomPct = (stomTotal / baseStomMax) * 100
    const bellyEl = document.getElementById('bt-belly-status')
    const bellyBar = document.getElementById('bt-belly-bar')
    if (bellyBar) {
      bellyBar.style.width = Math.min(stomPct, 100) + '%'
      bellyBar.classList.remove('tier-safe', 'tier-mild', 'tier-warn', 'tier-high', 'tier-crit', 'tier-neutral', 'overflow')
      if (stomPct > 100) bellyBar.classList.add('overflow')
    }
    if (bellyEl) {
      bellyEl.classList.remove('tier-safe', 'tier-mild', 'tier-warn', 'tier-high', 'tier-crit', 'tier-neutral')
      if (stomPct <= 5) { bellyEl.innerText = 'Flat'; bellyEl.classList.add('tier-neutral') }
      else if (stomPct <= 12) { bellyEl.innerText = 'Potbelly'; bellyEl.classList.add('tier-safe') }
      else if (stomPct <= 20) { bellyEl.innerText = 'Bloated'; bellyEl.classList.add('tier-mild') }
      else if (stomPct <= 35) { bellyEl.innerText = 'Full-Term'; bellyEl.classList.add('tier-mild') }
      else if (stomPct <= 48) { bellyEl.innerText = 'Twins'; bellyEl.classList.add('tier-warn') }
      else if (stomPct <= 60) { bellyEl.innerText = 'Triplets'; bellyEl.classList.add('tier-warn') }
      else if (stomPct <= 95) { bellyEl.innerText = 'Same-Size'; bellyEl.classList.add('tier-high') }
      else if (stomPct <= 125) { bellyEl.innerText = 'Double-Size'; bellyEl.classList.add('tier-crit') }
      else if (stomPct <= 160) { bellyEl.innerText = 'Room-Filling'; bellyEl.classList.add('tier-crit') }
      else { bellyEl.innerText = 'Critical / Bursting'; bellyEl.classList.add('tier-crit') }
    }

    const overCapPct = ((stomTotal + bowelTotal) / baseStomMax) * 100
    const mobEl = document.getElementById('bt-mobility')
    const mobBar = document.getElementById('bt-mobility-bar')
    if (mobBar) {
      mobBar.style.width = Math.min(overCapPct, 100) + '%'
      mobBar.classList.remove('tier-safe', 'tier-mild', 'tier-warn', 'tier-high', 'tier-crit', 'tier-neutral', 'overflow')
      if (overCapPct > 100) mobBar.classList.add('overflow')
    }
    if (mobEl) {
      mobEl.classList.remove('tier-safe', 'tier-mild', 'tier-warn', 'tier-high', 'tier-crit', 'tier-neutral')
      if (overCapPct <= 100) { mobEl.innerText = 'Agile / Normal'; mobEl.classList.add('tier-safe') }
      else if (overCapPct <= 110) { mobEl.innerText = 'Slowed, clumsy'; mobEl.classList.add('tier-mild') }
      else if (overCapPct <= 125) { mobEl.innerText = 'Half speed, stumbles'; mobEl.classList.add('tier-warn') }
      else if (overCapPct <= 150) { mobEl.innerText = 'Slow waddle only'; mobEl.classList.add('tier-high') }
      else { mobEl.innerText = 'Immobile'; mobEl.classList.add('tier-crit') }
    }

    // ─── Struggle risk assessment ───────────────────────────────
    let preyCount = 0
    let fightingCount = 0
    let reluctantCount = 0
    let willingCount = 0
    let totalPreyVolume = 0
    document.querySelectorAll('#stomach-container .vital-slot, #bowel-container .vital-slot').forEach((el) => {
      const type = (el.querySelector('.v-type') as HTMLSelectElement)?.value
      if (type !== 'Prey') return
      preyCount++
      const vol = parseFloat((el.querySelector('.v-vol') as HTMLInputElement)?.value || '0') || 0
      totalPreyVolume += vol
      const will = (el.querySelector('.v-willingness') as HTMLSelectElement)?.value || 'reluctant'
      if (will === 'fighting') fightingCount++
      else if (will === 'willing') willingCount++
      else reluctantCount++
    })

    const indigestionText = document.getElementById('bt-indigestion-val')?.textContent || '0%'
    const indigestion = parseFloat(indigestionText.replace('%', '')) || 0
    const indBar = document.getElementById('bt-indigestion-bar')
    if (indBar) {
      indBar.classList.remove('tier-safe', 'tier-mild', 'tier-warn', 'tier-high', 'tier-crit', 'tier-neutral')
      if (indigestion >= 90) indBar.classList.add('tier-crit')
      else if (indigestion >= 75) indBar.classList.add('tier-high')
      else if (indigestion >= 50) indBar.classList.add('tier-warn')
      else if (indigestion >= 25) indBar.classList.add('tier-mild')
      else indBar.classList.add('tier-safe')
    }

    const riskEl = document.getElementById('bt-struggle-risk')
    const detailEl = document.getElementById('bt-struggle-detail')
    const struggleBar = document.getElementById('bt-struggle-bar')
    if (riskEl && detailEl) {
      riskEl.classList.remove('tier-safe', 'tier-mild', 'tier-warn', 'tier-high', 'tier-crit', 'tier-neutral')
      if (struggleBar) struggleBar.classList.remove('tier-safe', 'tier-mild', 'tier-warn', 'tier-high', 'tier-crit', 'tier-neutral')
      if (preyCount === 0) {
        riskEl.textContent = 'None'
        riskEl.classList.add('tier-neutral')
        if (struggleBar) struggleBar.style.width = '0%'
        detailEl.textContent = ''
      } else {
        // Risk score: weighted by fighting prey, indigestion level, and fill ratio
        const fillRatio = baseStomMax > 0 ? totalPreyVolume / baseStomMax : 0
        const riskScore = (fightingCount * 30) + (reluctantCount * 10) + (indigestion * 0.5) + (fillRatio * 15)
        let riskLabel: string
        let riskTier: string
        if (riskScore >= 80 || indigestion >= 90) { riskLabel = 'CRITICAL — Vomit imminent'; riskTier = 'tier-crit' }
        else if (riskScore >= 50 || indigestion >= 75) { riskLabel = 'High — Vomit likely soon'; riskTier = 'tier-high' }
        else if (riskScore >= 25 || indigestion >= 50) { riskLabel = 'Moderate — Building pressure'; riskTier = 'tier-warn' }
        else if (riskScore >= 10 || indigestion >= 25) { riskLabel = 'Low — Some unrest'; riskTier = 'tier-mild' }
        else { riskLabel = 'Minimal — Calm'; riskTier = 'tier-safe' }
        riskEl.textContent = riskLabel
        riskEl.classList.add(riskTier)
        if (struggleBar) {
          struggleBar.style.width = Math.min(riskScore, 100) + '%'
          struggleBar.classList.add(riskTier)
        }
        const parts: string[] = []
        if (fightingCount > 0) parts.push(`${fightingCount} fighting`)
        if (reluctantCount > 0) parts.push(`${reluctantCount} reluctant`)
        if (willingCount > 0) parts.push(`${willingCount} willing`)
        parts.push(`${Math.round(indigestion)}% indigestion`)
        detailEl.textContent = parts.join(' · ')
      }
    }
  }

  document.getElementById('bt-height')?.addEventListener('input', updateCapacities)
  document.getElementById('bt-weight')?.addEventListener('input', updateCapacities)
  document.getElementById('bt-cap-mult')?.addEventListener('input', updateCapacities)
  document.getElementById('bt-womb-cap-mult')?.addEventListener('input', updateCapacities)
  document.getElementById('bt-balls-cap-mult')?.addEventListener('input', updateCapacities)
  document.getElementById('bt-penis-len')?.addEventListener('input', updateCapacities)
  document.getElementById('bt-penis-girth')?.addEventListener('input', updateCapacities)
  document.getElementById('bt-milk-ml')?.addEventListener('input', updateCapacities)
  document.getElementById('bt-lact-rate-mult')?.addEventListener('input', updateCapacities)
  document.getElementById('bt-breast-ml')?.addEventListener('input', updateCapacities)

  // ─── Arousal & Climax Sliders (Native HTML) ────────────────
  const arousalSlot = document.getElementById('bt-arousal-slot')
  const climaxSlot = document.getElementById('bt-climax-slot')

  if (arousalSlot) {
    arousalSlot.innerHTML = `
      <div class="bt-meter">
        <div class="bt-meter-header">
          <span class="bt-meter-label arousal">Arousal</span>
          <span class="bt-meter-val arousal" id="bt-arousal-val">0%</span>
        </div>
        <div class="bt-meter-track">
          <div id="bt-arousal-fill" class="bt-meter-fill arousal" style="width:0%"></div>
        </div>
        <input type="range" id="bt-arousal-slider" class="bt-meter-slider arousal" min="0" max="100" step="1" value="0">
      </div>
    `
    const arousalInput = document.getElementById('bt-arousal-slider') as HTMLInputElement
    const arousalVal = document.getElementById('bt-arousal-val')
    const arousalFill = document.getElementById('bt-arousal-fill')
    
    arousalInput?.addEventListener('input', () => {
      const v = parseInt(arousalInput.value) || 0
      if (arousalVal) arousalVal.textContent = v + '%'
      if (arousalFill) {
        arousalFill.style.width = v + '%'
        if (v >= 80) arousalFill.classList.add('pulse')
        else arousalFill.classList.remove('pulse')
      }
      updateCurrentPenisSize(v)
    })
  }

  if (climaxSlot) {
    climaxSlot.innerHTML = `
      <div class="bt-meter">
        <div class="bt-meter-header">
          <span class="bt-meter-label climax">Climax</span>
          <span class="bt-meter-val climax" id="bt-climax-val">0%</span>
        </div>
        <div class="bt-meter-track">
          <div id="bt-climax-fill" class="bt-meter-fill climax" style="width:0%"></div>
        </div>
        <input type="range" id="bt-climax-slider" class="bt-meter-slider climax" min="0" max="100" step="1" value="0" disabled>
      </div>
    `
  }

  function setArousalSlider(v: number) {
    const input = document.getElementById('bt-arousal-slider') as HTMLInputElement
    const val = document.getElementById('bt-arousal-val')
    const fill = document.getElementById('bt-arousal-fill')
    if (input) input.value = String(v)
    if (val) val.textContent = v + '%'
    if (fill) {
      fill.style.width = v + '%'
      if (v >= 80) fill.classList.add('pulse')
      else fill.classList.remove('pulse')
    }
    updateCurrentPenisSize(v)
  }

  function setClimaxSlider(v: number) {
    const input = document.getElementById('bt-climax-slider') as HTMLInputElement
    const val = document.getElementById('bt-climax-val')
    const fill = document.getElementById('bt-climax-fill')
    if (input) input.value = String(v)
    if (val) val.textContent = v + '%'
    if (fill) {
      fill.style.width = v + '%'
      if (v >= 90) fill.classList.add('pulse')
      else fill.classList.remove('pulse')
    }
  }

  function updateEnergyDisplay() {
    const energyInput = document.getElementById('bt-energy') as HTMLInputElement
    if (!energyInput) return
    const v = Math.max(0, Math.min(100, parseInt(energyInput.value) || 0))
    const bar = document.getElementById('bt-energy-bar')
    const status = document.getElementById('bt-energy-status')
    const tier = v >= 75 ? 'tier-safe' : v >= 50 ? 'tier-mild' : v >= 25 ? 'tier-warn' : v >= 10 ? 'tier-high' : 'tier-crit'
    if (bar) {
      bar.style.width = v + '%'
      bar.classList.remove('tier-safe', 'tier-mild', 'tier-warn', 'tier-high', 'tier-crit', 'tier-neutral')
      bar.classList.add(tier)
    }
    if (status) {
      const label = v >= 75 ? 'Energetic' : v >= 50 ? 'Steady' : v >= 25 ? 'Tired' : v >= 10 ? 'Exhausted' : 'Collapsing'
      status.textContent = label
      status.classList.remove('tier-safe', 'tier-mild', 'tier-warn', 'tier-high', 'tier-crit', 'tier-neutral')
      status.classList.add(tier)
    }
  }

  function updateHealthDisplay() {
    const healthInput = document.getElementById('bt-health') as HTMLInputElement
    if (!healthInput) return
    const v = Math.max(0, Math.min(100, parseInt(healthInput.value) || 0))
    const bar = document.getElementById('bt-health-bar')
    const status = document.getElementById('bt-health-status')
    const tier = v >= 75 ? 'tier-safe' : v >= 50 ? 'tier-mild' : v >= 25 ? 'tier-warn' : v >= 10 ? 'tier-high' : 'tier-crit'
    if (bar) {
      bar.style.width = v + '%'
      bar.classList.remove('tier-safe', 'tier-mild', 'tier-warn', 'tier-high', 'tier-crit', 'tier-neutral')
      bar.classList.add(tier)
    }
    if (status) {
      const label = v >= 75 ? 'Healthy' : v >= 50 ? 'Bruised' : v >= 25 ? 'Wounded' : v >= 10 ? 'Critical' : 'Dying'
      status.textContent = label
      status.classList.remove('tier-safe', 'tier-mild', 'tier-warn', 'tier-high', 'tier-crit', 'tier-neutral')
      status.classList.add(tier)
    }
  }

  document.getElementById('bt-energy')?.addEventListener('input', updateEnergyDisplay)
  document.getElementById('bt-health')?.addEventListener('input', updateHealthDisplay)

  function updateCurrentPenisSize(arousalVal: number) {
    const maxL = parseFloat(
      (document.getElementById('bt-penis-len') as HTMLInputElement)?.value,
    ) || 0
    const maxG = parseFloat(
      (document.getElementById('bt-penis-girth') as HTMLInputElement)?.value,
    ) || 0
    const curL = maxL * (0.3 + 0.7 * (arousalVal / 100))
    const curG = maxG * (0.3 + 0.7 * (arousalVal / 100))
    const display = document.getElementById('bt-penis-current')
    if (display) {
      display.textContent = `${curL.toFixed(1)} x ${curG.toFixed(1)}`
    }
  }

  document.getElementById('bt-penis-len')?.addEventListener('input', () => {
    const input = document.getElementById('bt-arousal-slider') as HTMLInputElement
    updateCurrentPenisSize(parseInt(input?.value || '0'))
  })
  document.getElementById('bt-penis-girth')?.addEventListener('input', () => {
    const input = document.getElementById('bt-arousal-slider') as HTMLInputElement
    updateCurrentPenisSize(parseInt(input?.value || '0'))
  })

  // ─── Input delegation for dynamic items ────────────────────
  panel.addEventListener('input', (e) => {
    const target = e.target as HTMLElement
    if (target.classList.contains('stomach-vol') || target.classList.contains('bowel-vol') || target.classList.contains('womb-vol') || target.classList.contains('balls-vol')) {
      updateCapacities()
    }
    if (target.classList.contains('item-dig-input')) {
      const val = parseInt((target as HTMLInputElement).value) || 0
      const slot = target.closest('.vital-slot')
      const statusSpan = slot?.querySelector('.item-status') as HTMLElement
      if (statusSpan && slot && !slot.classList.contains('is-liquid')) {
        if (slot.classList.contains('is-transit')) {
          // Bowels transit: prey is travelling, not digesting
          let text = 'Entering Bowels'
          let color = '#4CAF50'
          if (val >= 90) { text = 'Reaching Stomach'; color = '#ff9800' }
          else if (val >= 70) { text = 'Deep in Bowels'; color = '#ffeb3b' }
          else if (val >= 40) { text = 'In Transit'; color = '#8bc34a' }
          else if (val >= 10) { text = 'Settling In'; color = '#4CAF50' }
          statusSpan.innerText = text
          statusSpan.style.color = color
        } else {
          let text = 'Fully Conscious'
          let color = '#4CAF50'
          if (val >= 90) { text = 'Dead'; color = '#ff4444' }
          else if (val >= 80) { text = 'Unconscious'; color = '#999' }
          else if (val >= 70) { text = 'Drowsy'; color = '#ffeb3b' }
          else if (val >= 50) { text = 'Conscious'; color = '#ff9800' }
          statusSpan.innerText = text
          statusSpan.style.color = color
        }
      }
    }
  })

  panel.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const action = target.getAttribute('data-action')
    if (!action) return

    if (action === 'remove-stomach' || action === 'remove-remains' || action === 'remove-womb' || action === 'remove-balls') {
      target.closest('.vital-slot')?.remove()
      updateCapacities()
    } else if (action === 'remove-skill' || action === 'remove-trait') {
      target.closest('.bt-dynamic-item')?.remove()
    } else if (action === 'remove-inv') {
      target.closest('.dyn-inv')?.remove()
    } else if (action === 'add-buff') {
      const container = target.closest('.bt-buffs-section')?.querySelector('.bt-buffs-container')
      container?.appendChild(createBuffEntry(buffTargetDefs))
    } else if (action === 'remove-buff') {
      target.closest('.bt-buff-entry')?.remove()
    } else if (action === 'add-die') {
      const container = target.closest('.bt-dice-section')?.querySelector('.bt-dice-container')
      container?.appendChild(createDiceEntry())
    } else if (action === 'remove-die') {
      target.closest('.bt-dice-entry')?.remove()
    } else if (action === 'remove-dice-section') {
      target.closest('.bt-dice-section')?.remove()
      updateDiceEmptyHint()
    }
  })

  // ─── Dynamic item factory functions ────────────────────────
  // (createStomachItem, createRemainsItem, createBuffEntry,
  //  createSkillItem, createTraitItem, createInvItem are imported
  //  from ./frontend/components)

  function collectBuffsFromItem(el: Element): string {
    const entries: string[] = []
    el.querySelectorAll('.bt-buff-entry').forEach((buffEl) => {
      const stat = (buffEl.querySelector('.bt-buff-stat') as HTMLSelectElement)?.value
      const pct = (buffEl.querySelector('.bt-buff-pct') as HTMLInputElement)?.value.trim()
      if (stat && pct) {
        const pctNum = parseFloat(pct) || 0
        const sign = pctNum >= 0 ? '+' : ''
        entries.push(`${stat}:${sign}${pctNum}`)
      }
    })
    return entries.join(';')
  }

  document.getElementById('add-stomach-btn')?.addEventListener('click', () => {
    document.getElementById('stomach-container')?.appendChild(createStomachItem())
  })
  document.getElementById('add-remains-btn')?.addEventListener('click', () => {
    document.getElementById('bowel-container')?.appendChild(createRemainsItem())
  })
  document.getElementById('add-womb-btn')?.addEventListener('click', () => {
    document.getElementById('womb-container')?.appendChild(createWombItem())
  })
  document.getElementById('add-balls-btn')?.addEventListener('click', () => {
    document.getElementById('balls-container')?.appendChild(createBallsItem())
  })
  document.getElementById('add-skill-btn')?.addEventListener('click', () => {
    document.getElementById('skills-container')?.appendChild(createSkillItem())
  })
  document.getElementById('add-trait-btn')?.addEventListener('click', () => {
    document.getElementById('traits-container')?.appendChild(createTraitItem())
  })
  document.getElementById('add-inv-btn')?.addEventListener('click', () => {
    document.getElementById('inv-container')?.appendChild(createInvItem())
  })

  // ─── Dice section & preset management ──────────────────────
  function updateDiceEmptyHint() {
    const container = document.getElementById('dice-sections-container')
    const hint = document.getElementById('bt-dice-empty-hint')
    if (hint) hint.style.display = (container?.children.length ?? 0) > 0 ? 'none' : 'block'
  }

  function refreshPresetDropdown() {
    const select = document.getElementById('bt-dice-preset-select') as HTMLSelectElement
    if (!select) return
    const currentVal = select.value
    select.innerHTML = '<option value="">— Presets —</option>'
    const presets = currentSettings.dicePresets ?? []
    presets.forEach((p) => {
      const opt = document.createElement('option')
      opt.value = p.name
      opt.textContent = p.name
      select.appendChild(opt)
    })
    if (currentVal) select.value = currentVal
  }

  function collectDiceSectionsFromUi(): DiceSection[] {
    const sections: DiceSection[] = []
    document.querySelectorAll('.bt-dice-section').forEach((el) => {
      const name = (el.querySelector('.bt-dice-section-name') as HTMLInputElement)?.value.trim()
      if (!name) return
      const dice: DiceConfig[] = []
      el.querySelectorAll('.bt-dice-entry').forEach((dieEl) => {
        const sides = parseInt((dieEl.querySelector('.bt-dice-sides') as HTMLInputElement)?.value || '6') || 6
        const count = parseInt((dieEl.querySelector('.bt-dice-count') as HTMLInputElement)?.value || '1') || 1
        dice.push({ sides, count })
      })
      sections.push({ name, dice })
    })
    return sections
  }

  document.getElementById('add-dice-section-btn')?.addEventListener('click', () => {
    document.getElementById('dice-sections-container')?.appendChild(createDiceSection())
    updateDiceEmptyHint()
  })

  document.getElementById('bt-dice-load-preset')?.addEventListener('click', () => {
    const select = document.getElementById('bt-dice-preset-select') as HTMLSelectElement
    const presetName = select?.value
    if (!presetName) return
    const preset = (currentSettings.dicePresets ?? []).find((p) => p.name === presetName)
    if (!preset) return
    document.getElementById('dice-sections-container')!.innerHTML = ''
    preset.sections.forEach((sec) => {
      const sectionDiv = createDiceSection()
      ;(sectionDiv.querySelector('.bt-dice-section-name') as HTMLInputElement).value = sec.name
      sec.dice.forEach((d) => {
        const dieDiv = createDiceEntry()
        ;(dieDiv.querySelector('.bt-dice-sides') as HTMLInputElement).value = String(d.sides)
        ;(dieDiv.querySelector('.bt-dice-count') as HTMLInputElement).value = String(d.count)
        sectionDiv.querySelector('.bt-dice-container')?.appendChild(dieDiv)
      })
      document.getElementById('dice-sections-container')?.appendChild(sectionDiv)
    })
    updateDiceEmptyHint()
  })

  document.getElementById('bt-dice-save-preset')?.addEventListener('click', () => {
    const name = prompt('Enter a name for this preset:')
    if (!name || !name.trim()) return
    const trimmed = name.trim()
    const sections = collectDiceSectionsFromUi()
    if (sections.length === 0) return
    if (!currentSettings.dicePresets) currentSettings.dicePresets = []
    const existingIdx = currentSettings.dicePresets.findIndex((p) => p.name === trimmed)
    const preset: DicePreset = { name: trimmed, sections }
    if (existingIdx >= 0) {
      currentSettings.dicePresets[existingIdx] = preset
    } else {
      currentSettings.dicePresets.push(preset)
    }
    saveSettings(currentSettings)
    refreshPresetDropdown()
    const select = document.getElementById('bt-dice-preset-select') as HTMLSelectElement
    if (select) select.value = trimmed
  })

  document.getElementById('bt-dice-delete-preset')?.addEventListener('click', () => {
    const select = document.getElementById('bt-dice-preset-select') as HTMLSelectElement
    const presetName = select?.value
    if (!presetName) return
    if (!confirm(`Delete preset "${presetName}"?`)) return
    currentSettings.dicePresets = (currentSettings.dicePresets ?? []).filter((p) => p.name !== presetName)
    saveSettings(currentSettings)
    refreshPresetDropdown()
  })

  refreshPresetDropdown()
  updateDiceEmptyHint()

  // ─── Flag buttons on fields ────────────────────────────────
  function addFlagButtons() {
    // Fields that are auto-managed and should never get a pin button.
    const skipFieldIds = new Set([
      'Health', 'Energy',
      'StomachResistance',
      'CapacityMultiplier', 'WombCapacityMultiplier', 'BallsCapacityMultiplier', 'LactationRateMultiplier',
      'MilkVolume_ml',
      'CurrentAcidPct', 'BaseDigestionRate', 'AcidRiseRate',
    ])
    const fields = panel.querySelectorAll('.bt-scrape, .bt-cloth-slot')
    fields.forEach((field) => {
      const input = field as HTMLElement

      // Skip <select> elements (toggles like wealth / clothing mode) —
      // these are not free-text fields the LLM should populate.
      if (input.tagName === 'SELECT') return

      const fieldId = input.getAttribute('data-id') || input.getAttribute('data-slot') || ''
      if (!fieldId) return

      // Skip auto-managed fields (Health, Energy, etc.).
      if (skipFieldIds.has(fieldId)) return

      const row = input.closest('.bt-row')
      let container: HTMLElement

      // Prefer the input's direct parent when it is already positioned
      // (e.g. an inline position:relative wrapper) so the pin button
      // lands at the right edge of the input itself, not the whole row.
      const parent = input.parentElement
      if (parent && parent.style.position === 'relative') {
        container = parent
      } else if (row) {
        container = row as HTMLElement
      } else {
        if (!parent) return
        const wrapper = document.createElement('div')
        wrapper.className = 'bt-flag-wrap'
        parent.insertBefore(wrapper, input)
        wrapper.appendChild(input)
        container = wrapper
      }

      if (container.querySelector('.bt-flag-btn')) return
      container.style.position = 'relative'

      // Reserve space on the right so the flag button (positioned at
      // right:4px) doesn't cover the value. Applies to number inputs
      // (right-aligned) and any text input whose container is the
      // input's own positioned wrapper.
      if (
        input.tagName === 'INPUT' &&
        ((input as HTMLInputElement).type === 'number' ||
          container !== row)
      ) {
        ;(input as HTMLInputElement).style.paddingRight = '22px'
      }

      const btn = document.createElement('button')
      btn.className = 'bt-flag-btn'
      btn.textContent = '📌'
      btn.dataset.flagged = 'false'
      btn.dataset.fieldId = fieldId

      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        e.preventDefault()
        const flagged = btn.dataset.flagged === 'true'
        btn.dataset.flagged = (!flagged).toString()
        const inp = input as HTMLInputElement
        if (!flagged) {
          inp.style.borderLeft = '3px solid #ffd700'
          inp.style.paddingLeft = '8px'
        } else {
          inp.style.borderLeft = ''
          inp.style.paddingLeft = ''
        }
      })
      container.appendChild(btn)
    })
  }
  addFlagButtons()

  // ─── Build current XML from form ───────────────────────────
  function buildCurrentXml(): string {
    const stateTags = ['Health', 'Energy', 'Time', 'Weather', 'Temperature', 'Area', 'Building', 'Room']

    let xml = `<CharacterSheet>\n  <State>\n`
    document.querySelectorAll('.bt-scrape').forEach((el) => {
      const input = el as HTMLInputElement
      const val = input.value.trim()
      const id = input.getAttribute('data-id')
      if (val !== '' && val !== '0' && id && stateTags.includes(id)) {
        xml += `    <${id}>${val}</${id}>\n`
      }
    })
    // ALWAYS emit <Time> even when empty — if the field is omitted on manual
    // sync, the stored sheet loses its time reference and every subsequent
    // digestion tick is skipped ("extension forgot the time" bug).
    const timeInput = document.querySelector('.bt-scrape[data-id="Time"]') as HTMLInputElement
    if (timeInput && !/<Time>/i.test(xml)) {
      xml += `    <Time>${timeInput.value.trim() || '00:00'}</Time>\n`
    }
    const arousalInput = document.getElementById('bt-arousal-slider') as HTMLInputElement
    const arousalVal = parseInt(arousalInput?.value || '0')
    xml += `    <Arousal>${arousalVal}</Arousal>\n`
    xml += `  </State>\n\n  <BaseStats>\n`
    
    document.querySelectorAll('.bt-scrape').forEach((el) => {
      const input = el as HTMLInputElement
      const val = input.value.trim()
      const id = input.getAttribute('data-id')
      if (val !== '' && val !== '0' && id && !stateTags.includes(id)) {
        xml += `    <${id}>${val}</${id}>\n`
      }
    })
    // ALWAYS emit the active currency fields (defaulting to 0) even when
    // empty — otherwise the LLM never sees that wealth fields exist and
    // starts stuffing money into <Backpack> as inventory items.
    const currencySelect = document.getElementById('bt-currency-type') as HTMLSelectElement
    if (currencySelect?.value === 'fantasy') {
      for (const ck of ['Gold', 'Silver', 'Copper']) {
        const cInput = document.querySelector(`.bt-scrape[data-id="${ck}"]`) as HTMLInputElement
        xml += `    <${ck}>${cInput?.value.trim() || '0'}</${ck}>\n`
      }
    } else {
      const cashInput = document.querySelector('.bt-scrape[data-id="CashBalance"]') as HTMLInputElement
      xml += `    <CashBalance>${cashInput?.value.trim() || '0'}</CashBalance>\n`
    }
    // Attributes block inside BaseStats
    const attrKeys = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
    let attrXml = `    <Attributes>`
    let hasAttr = false
    for (const ak of attrKeys) {
      const attrInput = document.getElementById('bt-attr-' + ak.toLowerCase()) as HTMLInputElement
      const attrVal = attrInput?.value.trim() || '10'
      if (attrVal !== '10') hasAttr = true
      attrXml += `<${ak}>${attrVal}</${ak}>`
    }
    attrXml += `</Attributes>\n`
    if (hasAttr) xml += attrXml
    xml += `  </BaseStats>\n\n  <Clothing>\n`
    document.querySelectorAll('.bt-cloth-slot').forEach((el) => {
      const input = el as HTMLInputElement
      const val = input.value.trim()
      const slot = input.getAttribute('data-slot')
      if (val !== '') {
        const flexEl = input.previousElementSibling?.querySelector('.bt-cloth-flex') as HTMLSelectElement
        const flexStr = flexEl ? ` elasticity="${flexEl.value}"` : ''
        xml += `    <Equip slot="${slot}"${flexStr}>${val}</Equip>\n`
      }
    })
    xml += `  </Clothing>\n\n  <Backpack>\n`
    document.querySelectorAll('.dyn-inv').forEach((el) => {
      const qty = (el.querySelector('.d-qty') as HTMLInputElement)?.value.trim() || '1'
      const name = (el.querySelector('.d-name') as HTMLInputElement)?.value.trim()
      if (name) xml += `    <Item qty="${qty}">${name}</Item>\n`
    })
    xml += `  </Backpack>\n\n  <SkillsAndTraits>\n`
    document.querySelectorAll('.dyn-skill').forEach((el) => {
      const name = (el.querySelector('.d-name') as HTMLInputElement)?.value.trim()
      const lvl = (el.querySelector('.d-lvl') as HTMLInputElement)?.value.trim() || '1'
      const desc = (el.querySelector('.d-desc') as HTMLTextAreaElement)?.value.trim()
      const buffsStr = collectBuffsFromItem(el)
      let attrs = `name="${name}" level="${lvl}"`
      if (buffsStr) attrs += ` buffs="${buffsStr}"`
      if (name) xml += `    <Skill ${attrs}>${desc}</Skill>\n`
    })
    document.querySelectorAll('.dyn-trait').forEach((el) => {
      const name = (el.querySelector('.d-name') as HTMLInputElement)?.value.trim()
      const desc = (el.querySelector('.d-desc') as HTMLTextAreaElement)?.value.trim()
      const buffsStr = collectBuffsFromItem(el)
      let attrs = `name="${name}"`
      if (buffsStr) attrs += ` buffs="${buffsStr}"`
      if (name) xml += `    <Trait ${attrs}>${desc}</Trait>\n`
    })
    xml += `  </SkillsAndTraits>\n\n  <DigestiveTract>\n`

    const bellyStatus = document.getElementById('bt-belly-status')?.innerText || 'Flat'
    const mobility = document.getElementById('bt-mobility')?.innerText || 'Agile'
    const stomFill = document.getElementById('bt-stom-fill')?.innerText || '0 L'
    const stomMax = document.getElementById('bt-stom-max-disp')?.innerText || '0 L'
    const bowFill = document.getElementById('bt-bowel-fill')?.innerText || '0 L'

    xml += `    <Status belly="${bellyStatus}" mobility="${mobility}" />\n`
    const suppressing = (document.getElementById('bt-suppressing-toggle') as HTMLInputElement)?.checked ? 'true' : 'false'
    const indBar = document.getElementById('bt-indigestion-bar')
    const indigestion = indBar?.dataset.indigestion || '0'
    const indigestionEvents = indBar?.dataset.indigestionEvents || ''
    const fatigueInfo = document.getElementById('bt-fatigue-info')
    const stomachFatigue = fatigueInfo?.dataset.stomachFatigue || '0'
    let stomAttrs = `current="${stomFill}" max="${stomMax}" suppressing="${suppressing}" indigestion="${indigestion}" stomachFatigue="${stomachFatigue}"`
    if (indigestionEvents) stomAttrs += ` indigestionEvents="${indigestionEvents}"`
    xml += `    <Stomach ${stomAttrs}>\n`

    document.querySelectorAll('#stomach-container .vital-slot').forEach((el) => {
      const name = (el.querySelector('.v-name') as HTMLInputElement)?.value.trim() || 'Unknown'
      const vol = (el.querySelector('.v-vol') as HTMLInputElement)?.value.trim() || '0'
      const dig = (el.querySelector('.v-dig') as HTMLInputElement)?.value.trim() || '0'
      const type = (el.querySelector('.v-type') as HTMLSelectElement)?.value || 'Food'
      const flavor = (el.querySelector('.v-flavor') as HTMLTextAreaElement)?.value.trim()
      const gear = (el.querySelector('.v-gear') as HTMLTextAreaElement)?.value.trim()
      const appearance = (el.querySelector('.v-appearance') as HTMLTextAreaElement)?.value.trim()

      let itemAttrs = `type="${type}" name="${name}" volume_L="${vol}" digestion="${dig}%"`
      if (type === 'Prey') {
        const willingness = (el.querySelector('.v-willingness') as HTMLSelectElement)?.value || 'reluctant'
        const staminaText = (el.querySelector('.v-stamina-val') as HTMLElement)?.textContent || '100%'
        const stamina = parseFloat(staminaText.replace('%', '')) || 100
        const struggleText = (el.querySelector('.v-struggle-val') as HTMLElement)?.textContent || '+0.00%'
        const struggle = parseFloat(struggleText.replace(/[+%]/g, '')) || 0
        itemAttrs += ` willingness="${willingness}" stamina="${stamina}" struggle="${struggle.toFixed(2)}"`
      }
      xml += `      <Item ${itemAttrs}>\n`
      if (appearance) xml += `        <Appearance>${appearance}</Appearance>\n`
      if (flavor) xml += `        <Description>${flavor}</Description>\n`
      if (type === 'Prey' && gear) xml += `        <BoundGear>${gear}</BoundGear>\n`
      xml += `      </Item>\n`
    })

    xml += `    </Stomach>\n    <Bowels current="${bowFill}">\n`
    document.querySelectorAll('#bowel-container .vital-slot').forEach((el) => {
      if (el.classList.contains('is-remains')) {
        // Waste / remains
        const name = (el.querySelector('.v-name') as HTMLInputElement)?.value.trim() || 'Waste'
        const vol = (el.querySelector('.v-vol') as HTMLInputElement)?.value.trim() || '0'
        xml += `      <Remains volume_L="${vol}">${name}</Remains>\n`
      } else {
        // Prey item (full-tour scenario)
        const name = (el.querySelector('.v-name') as HTMLInputElement)?.value.trim() || 'Unknown'
        const vol = (el.querySelector('.v-vol') as HTMLInputElement)?.value.trim() || '0'
        const dig = (el.querySelector('.v-dig') as HTMLInputElement)?.value.trim() || '0'
        const type = (el.querySelector('.v-type') as HTMLSelectElement)?.value || 'Food'
        const flavor = (el.querySelector('.v-flavor') as HTMLTextAreaElement)?.value.trim()
        const gear = (el.querySelector('.v-gear') as HTMLTextAreaElement)?.value.trim()
        const appearance = (el.querySelector('.v-appearance') as HTMLTextAreaElement)?.value.trim()

        let itemAttrs = `type="${type}" name="${name}" volume_L="${vol}" transit="${dig}%"`
        if (type === 'Prey') {
          const willingness = (el.querySelector('.v-willingness') as HTMLSelectElement)?.value || 'reluctant'
          const staminaText = (el.querySelector('.v-stamina-val') as HTMLElement)?.textContent || '100%'
          const stamina = parseFloat(staminaText.replace('%', '')) || 100
          const struggleText = (el.querySelector('.v-struggle-val') as HTMLElement)?.textContent || '+0.00%'
          const struggle = parseFloat(struggleText.replace(/[+%]/g, '')) || 0
          itemAttrs += ` willingness="${willingness}" stamina="${stamina}" struggle="${struggle.toFixed(2)}"`
        }
        xml += `      <Item ${itemAttrs}>\n`
        if (appearance) xml += `        <Appearance>${appearance}</Appearance>\n`
        if (flavor) xml += `        <Description>${flavor}</Description>\n`
        if (type === 'Prey' && gear) xml += `        <BoundGear>${gear}</BoundGear>\n`
        xml += `      </Item>\n`
      }
    })

    // Womb
    const wombFill = document.getElementById('bt-womb-fill')?.innerText || '0 L'
    xml += `    <Womb current="${wombFill}">\n`
    document.querySelectorAll('#womb-container .vital-slot').forEach((el) => {
      const name = (el.querySelector('.v-name') as HTMLInputElement)?.value.trim() || 'Unknown'
      const vol = (el.querySelector('.v-vol') as HTMLInputElement)?.value.trim() || '0'
      const abs = (el.querySelector('.v-dig') as HTMLInputElement)?.value.trim() || '0'
      const type = (el.querySelector('.v-type') as HTMLSelectElement)?.value || 'Food'
      const flavor = (el.querySelector('.v-flavor') as HTMLTextAreaElement)?.value.trim()
      const gear = (el.querySelector('.v-gear') as HTMLTextAreaElement)?.value.trim()
      const appearance = (el.querySelector('.v-appearance') as HTMLTextAreaElement)?.value.trim()

      let itemAttrs = `type="${type}" name="${name}" volume_L="${vol}" absorption="${abs}%"`
      if (type === 'Prey') {
        const willingness = (el.querySelector('.v-willingness') as HTMLSelectElement)?.value || 'reluctant'
        const staminaText = (el.querySelector('.v-stamina-val') as HTMLElement)?.textContent || '100%'
        const stamina = parseFloat(staminaText.replace('%', '')) || 100
        itemAttrs += ` willingness="${willingness}" stamina="${stamina}"`
      }
      xml += `      <Item ${itemAttrs}>\n`
      if (appearance) xml += `        <Appearance>${appearance}</Appearance>\n`
      if (flavor) xml += `        <Description>${flavor}</Description>\n`
      if (type === 'Prey' && gear) xml += `        <BoundGear>${gear}</BoundGear>\n`
      xml += `      </Item>\n`
    })
    xml += `    </Womb>\n`

    // Balls
    const ballsFill = document.getElementById('bt-balls-fill')?.innerText || '0 L'
    const cumVolText = document.getElementById('bt-cum-vol')?.textContent || '0 ml'
    const cumVol = parseFloat(cumVolText.replace(/[^\d.]/g, '')) || 0
    xml += `    <Balls current="${ballsFill}" cumVolume="${cumVol}">\n`
    document.querySelectorAll('#balls-container .vital-slot').forEach((el) => {
      const name = (el.querySelector('.v-name') as HTMLInputElement)?.value.trim() || 'Unknown'
      const vol = (el.querySelector('.v-vol') as HTMLInputElement)?.value.trim() || '0'
      const conv = (el.querySelector('.v-dig') as HTMLInputElement)?.value.trim() || '0'
      const type = (el.querySelector('.v-type') as HTMLSelectElement)?.value || 'Food'
      const flavor = (el.querySelector('.v-flavor') as HTMLTextAreaElement)?.value.trim()
      const gear = (el.querySelector('.v-gear') as HTMLTextAreaElement)?.value.trim()
      const appearance = (el.querySelector('.v-appearance') as HTMLTextAreaElement)?.value.trim()

      let itemAttrs = `type="${type}" name="${name}" volume_L="${vol}" conversion="${conv}%"`
      if (type === 'Prey') {
        const willingness = (el.querySelector('.v-willingness') as HTMLSelectElement)?.value || 'reluctant'
        const staminaText = (el.querySelector('.v-stamina-val') as HTMLElement)?.textContent || '100%'
        const stamina = parseFloat(staminaText.replace('%', '')) || 100
        itemAttrs += ` willingness="${willingness}" stamina="${stamina}"`
      }
      xml += `      <Item ${itemAttrs}>\n`
      if (appearance) xml += `        <Appearance>${appearance}</Appearance>\n`
      if (flavor) xml += `        <Description>${flavor}</Description>\n`
      if (type === 'Prey' && gear) xml += `        <BoundGear>${gear}</BoundGear>\n`
      xml += `      </Item>\n`
    })
    xml += `    </Balls>\n  </DigestiveTract>\n`
    // DicePool
    const diceSections = document.querySelectorAll('.bt-dice-section')
    if (diceSections.length > 0) {
      xml += `  <DicePool>\n`
      diceSections.forEach((el) => {
        const name = (el.querySelector('.bt-dice-section-name') as HTMLInputElement)?.value.trim()
        if (!name) return
        xml += `    <Section name="${name}">\n`
        el.querySelectorAll('.bt-dice-entry').forEach((dieEl) => {
          const sides = (dieEl.querySelector('.bt-dice-sides') as HTMLInputElement)?.value.trim() || '6'
          const count = (dieEl.querySelector('.bt-dice-count') as HTMLInputElement)?.value.trim() || '1'
          xml += `      <Die sides="${sides}" count="${count}" />\n`
        })
        xml += `    </Section>\n`
      })
      xml += `  </DicePool>\n`
    }
    xml += `</CharacterSheet>`
    return xml
  }

  // ─── Sync to AI button ─────────────────────────────────────
  document.getElementById('bt-sync-btn')?.addEventListener('click', () => {
    const xml = buildCurrentXml()
    const btn = document.getElementById('bt-sync-btn')
    if (btn) {
      btn.innerText = '✅ Data Synced to AI!'
      btn.style.background = '#4CAF50'
      setTimeout(() => {
        btn.innerText = '💾 Sync Changes to AI'
        btn.style.background = 'var(--bt-surface-3)'
      }, 2000)
    }
    sendSyncBioData(ctx, xml)

    const previewContent = document.getElementById('bt-preview-content')
    if (previewContent) {
      previewContent.innerText = xml
      document.getElementById('bt-preview-modal')!.style.display = 'flex'
    }
  })

  document.getElementById('bt-sync-chat-btn')?.addEventListener('click', () => {
    const btn = document.getElementById('bt-sync-chat-btn') as HTMLButtonElement
    if (btn) { btn.innerText = '⏳ Syncing...'; btn.style.background = 'var(--bt-border-strong)' }
    sendGetLatestSheet(ctx)
  })

  let populateInProgress = false

  document.getElementById('bt-populate-btn')?.addEventListener('click', () => {
    const btn = document.getElementById('bt-populate-btn') as HTMLButtonElement

    // Guard: prevent spamming while a populate generation is running.
    if (populateInProgress) return

    const flagged: string[] = []
    panel.querySelectorAll('.bt-flag-btn[data-flagged="true"]').forEach((b) => {
      const id = (b as HTMLElement).dataset.fieldId
      if (id) flagged.push(id)
    })

    if (flagged.length === 0) {
      if (btn) {
        btn.innerText = '⚠️ No fields flagged'
        btn.style.background = '#ff4444'
        setTimeout(() => {
          btn.innerText = '✨ Populate Flagged Fields'
          btn.style.background = 'var(--bt-surface-2)'
        }, 2000)
      }
      return
    }

    populateInProgress = true
    if (btn) { btn.innerText = '⏳ Populating...'; btn.style.background = 'var(--bt-border-strong)' }
    const xml = buildCurrentXml()
    sendPopulateFields(ctx, flagged, xml)
  })

  // ─── Breast cup calculator ─────────────────────────────────
  const breastInput = document.getElementById('bt-breast-ml') as HTMLInputElement
  const breastCup = document.getElementById('bt-breast-cup') as HTMLSpanElement
  breastInput?.addEventListener('input', () => {
    const ml = parseInt(breastInput.value) || 0
    let cup = 'AA'
    if (ml >= 1000) cup = 'H+'
    else if (ml >= 800) cup = 'G'
    else if (ml >= 650) cup = 'F'
    else if (ml >= 550) cup = 'DD'
    else if (ml >= 450) cup = 'D'
    else if (ml >= 350) cup = 'C'
    else if (ml >= 250) cup = 'B'
    else if (ml >= 150) cup = 'A'
    breastCup.innerText = cup
  })

  // ─── Color effect for hair/eyes/skin ───────────────────────
  function applyColorEffect(inputId: string) {
    const el = document.getElementById(inputId)
    if (!el) return
    el.addEventListener('input', (e) => {
      const val = (e.target as HTMLInputElement).value.toLowerCase()
      let foundColor = ''
      for (const key in colorMap) {
        if (val.includes(key)) { foundColor = colorMap[key]; break }
      }
      if (foundColor) {
        el.style.borderLeft = '4px solid ' + foundColor
        el.style.paddingLeft = '8px'
      } else {
        el.style.borderLeft = '1px solid #444'
        el.style.paddingLeft = '6px'
      }
    })
  }
  applyColorEffect('bt-hair')
  applyColorEffect('bt-eyes')
  applyColorEffect('bt-skin')

  // ─── Gender icon ───────────────────────────────────────────
  const genderInput = document.getElementById('bt-gender') as HTMLInputElement
  const genderIcon = document.getElementById('bt-gender-icon')
  if (genderInput && genderIcon) {
    genderInput.addEventListener('input', () => {
      const val = genderInput.value.toLowerCase().trim()
      let icon = ''
      let color = '#fff'
      if (val === 'female' || val === 'woman' || val === 'girl' || val === 'f') {
        icon = '♀️'; color = '#ff99cc'
      } else if (val === 'male' || val === 'man' || val === 'boy' || val === 'm') {
        icon = '♂️'; color = '#66b2ff'
      } else if (val.includes('trans') || val.includes('non-binary') || val === 'nb' || val === 't') {
        icon = '⚧️'; color = '#e0e0e0'
      } else if (val.includes('futa') || val.includes('herm') || val.includes('intersex') || val === 'h' || val === 'i') {
        icon = '⚥'; color = '#cc99ff'
      }
      genderIcon.innerText = icon
      genderIcon.style.color = color
    })
  }

  // ─── Tag interceptor: hide sheet_update from chat ──────────
  const unsubTag = ctx.messages.registerTagInterceptor(
    { tagName: 'sheet_update', removeFromMessage: true },
    () => {},
  )

  // ─── Backend message handler ───────────────────────────────
  ctx.onBackendMessage((msg: any) => {
    if (msg.type === 'THEME_INFO' && msg.mode) {
      applyTheme({
        mode: msg.mode,
        accent: msg.accent || { h: 0, s: 70, l: 60 },
        fontScale: msg.fontScale || 1,
        radiusScale: msg.radiusScale || 1,
      })
    }
    if (msg.type === 'SHEET_UPDATED' && msg.xml) {
      try {
        const indMatch = msg.xml.match(/<Stomach(?![a-zA-Z])[^>]*\sindigestion="([^"]*)"/i)
        // ── DIAGNOSTIC: log bowels section received via SHEET_UPDATED ──
        const bowMatch = msg.xml.match(/<Bowels[^>]*>([\s\S]*?)<\/Bowels>/i)
        console.log(`[SHEET_UPDATED] received indigestion="${indMatch ? indMatch[1] : 'MISSING'}"`)
        console.log(`[SHEET_UPDATED] bowels=${bowMatch ? bowMatch[1].trim().slice(0, 400) : 'NONE'}`)
        populateFormFromXml(msg.xml)
      } catch (e) {
        console.error('[SHEET_UPDATED] populateFormFromXml failed:', e)
      }
      if (currentSettings.ui.autoOpen) {
        panel.classList.add('open')
        floatingBtn.style.display = 'none'
      }
    }
    if (msg.type === 'LATEST_SHEET') {
      const btn = document.getElementById('bt-sync-chat-btn')
      if (msg.xml) {
        try {
          populateFormFromXml(msg.xml)
          if (btn) {
            btn.innerText = '✅ Synced!'
            btn.style.background = '#4CAF50'
            setTimeout(() => {
              btn.innerText = '🔄 Sync from Latest Message'
              btn.style.background = 'var(--bt-surface-2)'
            }, 2000)
          }
        } catch (e) {
          if (btn) {
            btn.innerText = '⚠️ Parse Error'
            btn.style.background = '#ff4444'
            setTimeout(() => {
              btn.innerText = '🔄 Sync from Latest Message'
              btn.style.background = 'var(--bt-surface-2)'
            }, 2000)
          }
        }
      } else {
        if (btn) {
          btn.innerText = '⚠️ No Sheet Found'
          btn.style.background = '#ff4444'
          setTimeout(() => {
            btn.innerText = '🔄 Sync from Latest Message'
            btn.style.background = 'var(--bt-surface-2)'
          }, 2000)
        }
      }
    }
    if (msg.type === 'POPULATE_DONE') {
      populateInProgress = false
      const btn = document.getElementById('bt-populate-btn') as HTMLButtonElement
      if (msg.success) {
        panel.querySelectorAll('.bt-flag-btn[data-flagged="true"]').forEach((b) => {
          const flagBtn = b as HTMLElement
          flagBtn.dataset.flagged = 'false'
          const fieldId = flagBtn.dataset.fieldId
          const input = panel.querySelector(`[data-id="${fieldId}"], [data-slot="${fieldId}"]`) as HTMLElement
          if (input) {
            input.style.borderLeft = ''
            input.style.paddingLeft = ''
          }
        })
        if (btn) {
          btn.innerText = '✅ Populated!'
          btn.style.background = '#4CAF50'
          setTimeout(() => {
            btn.innerText = '✨ Populate Flagged Fields'
            btn.style.background = 'var(--bt-surface-2)'
          }, 2000)
        }
      } else {
        if (btn) {
          btn.innerText = '⚠️ Populate Failed'
          btn.style.background = '#ff4444'
          setTimeout(() => {
            btn.innerText = '✨ Populate Flagged Fields'
            btn.style.background = 'var(--bt-surface-2)'
          }, 2000)
        }
      }
    }
  })

  // ─── Helper: extract text from swipe content ───────────────
  function getSwipeText(swipe: any): string {
    if (typeof swipe === 'string') return swipe
    if (swipe && typeof swipe === 'object') {
      if (typeof swipe.content === 'string') return swipe.content
      if (Array.isArray(swipe.content)) {
        return swipe.content.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n')
      }
      if (typeof swipe.text === 'string') return swipe.text
    }
    return ''
  }

  function extractSheetUpdateFromText(text: string): string | null {
    if (!text) return null
    let cleanText = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    const match = cleanText.match(/<sheet_update>\s*([\s\S]*?)\s*<\/sheet_update>/i)
    return match ? match[1].trim() : null
  }

  // ─── Live preview on swipe ─────────────────────────────────
  ctx.events.on('MESSAGE_SWIPED', (payload: any) => {
    if (payload.action === 'navigated' || payload.action === 'added' || payload.action === 'updated') {
      const msg = payload.message
      const swipeId = payload.swipeId
      if (msg && msg.swipes && msg.swipes[swipeId] !== undefined) {
        const swipeText = getSwipeText(msg.swipes[swipeId])
        const updateXml = extractSheetUpdateFromText(swipeText)
        // ── DIAGNOSTIC: log bowels section from MESSAGE_SWIPED ──
        const bowMatchSwipe = updateXml ? updateXml.match(/<Bowels[^>]*>([\s\S]*?)<\/Bowels>/i) : null
        console.log(`[MESSAGE_SWIPED] action=${payload.action} hasXml=${!!updateXml} bowels=${bowMatchSwipe ? bowMatchSwipe[1].trim().slice(0, 400) : 'NONE'}`)
        if (updateXml) {
          try { populateFormFromXml(updateXml) } catch (e) {}
        }
      }
    }
  })

  // ─── XML to form parser ────────────────────────────────────
  function populateFormFromXml(xml: string) {
    document.querySelectorAll(
      '.dyn-skill, .dyn-trait, .dyn-inv, #stomach-container .vital-slot, #bowel-container .vital-slot, #womb-container .vital-slot, #balls-container .vital-slot, .bt-dice-section'
    ).forEach((el) => el.remove())

    document.querySelectorAll('.cloth-badge').forEach((el) => el.remove())

    if (!xml || xml.trim() === '') return

    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'application/xml')
    const parseError = doc.querySelector('parsererror')
    if (parseError) return

    const getText = (tag: string) => doc.querySelector(tag)?.textContent || ''
    const getAttr = (el: Element | null, attr: string) => el?.getAttribute(attr) || ''

    const stateTags = ['Health', 'Energy', 'Time', 'Weather', 'Temperature', 'Area', 'Building', 'Room']

    const state = doc.querySelector('State')
    if (state) {
      document.querySelectorAll('.bt-scrape').forEach((el) => {
        const input = el as HTMLInputElement
        const id = input.getAttribute('data-id')
        if (id && stateTags.includes(id)) {
          const node = state.querySelector(id)
          if (node) input.value = node.textContent || ''
        }
      })
    }

    const baseStats = doc.querySelector('BaseStats')
    if (baseStats) {
      document.querySelectorAll('.bt-scrape').forEach((el) => {
        const input = el as HTMLInputElement
        const id = input.getAttribute('data-id')
        if (id && !stateTags.includes(id)) {
          const node = baseStats.querySelector(id)
          if (node) input.value = node.textContent || ''
        }
      })
    }

    // Parse Attributes block
    const attrBlock = baseStats?.querySelector('Attributes')
    if (attrBlock) {
      const attrKeys = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
      for (const ak of attrKeys) {
        const node = attrBlock.querySelector(ak)
        const input = document.getElementById('bt-attr-' + ak.toLowerCase()) as HTMLInputElement
        if (node && input) input.value = node.textContent || '10'
        if (ak) updateAttrModDisplay(ak)
      }
    } else {
      // Reset to defaults if no Attributes block
      const attrKeys = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
      for (const ak of attrKeys) {
        const input = document.getElementById('bt-attr-' + ak.toLowerCase()) as HTMLInputElement
        if (input) input.value = '10'
        updateAttrModDisplay(ak)
      }
    }

    // Trigger visual updates
    document.getElementById('bt-height')?.dispatchEvent(new Event('input'))
    document.getElementById('bt-weight')?.dispatchEvent(new Event('input'))
    document.getElementById('bt-breast-ml')?.dispatchEvent(new Event('input'))
    document.getElementById('bt-gender')?.dispatchEvent(new Event('input'))
    document.getElementById('bt-hair')?.dispatchEvent(new Event('input'))
    document.getElementById('bt-eyes')?.dispatchEvent(new Event('input'))
    document.getElementById('bt-skin')?.dispatchEvent(new Event('input'))
    updateEnergyDisplay()
    updateHealthDisplay()

    // Update Arousal & Climax sliders
    const arousalVal = parseFloat(getText('Arousal')) || 0
    const climaxVal = parseFloat(getText('Climax')) || 0
    setArousalSlider(arousalVal)
    setClimaxSlider(climaxVal)

    const currencySystem = getText('CurrencySystem')
    if (currencySystem) {
      const currSelect = document.getElementById('bt-currency-type') as HTMLSelectElement
      if (currSelect) {
        currSelect.value = currencySystem
        currSelect.dispatchEvent(new Event('change'))
      }
    }

    doc.querySelectorAll('Equip').forEach((equipNode) => {
      const slot = equipNode.getAttribute('slot')
      const elasticity = equipNode.getAttribute('elasticity') || 'standard'
      const value = equipNode.textContent || ''
      const condition = equipNode.getAttribute('condition') || 'intact'
      if (!slot) return
      const input = document.querySelector(`.bt-cloth-slot[data-slot="${slot}"]`) as HTMLInputElement
      if (input) {
        input.value = value
        const flexSelect = input.previousElementSibling?.querySelector('.bt-cloth-flex') as HTMLSelectElement
        if (flexSelect) flexSelect.value = elasticity

        let labelEl: HTMLElement | null = input.previousElementSibling as HTMLElement
        if (labelEl && labelEl.classList.contains('flex-row')) {
          labelEl = labelEl.querySelector('.slot-label')
        }
        if (labelEl) {
          let badge = labelEl.querySelector('.cloth-badge') as HTMLElement
          if (!badge) {
            badge = document.createElement('span')
            badge.className = 'cloth-badge'
            labelEl.appendChild(badge)
          }
          if (condition && condition !== 'intact') {
            badge.innerText = `(${condition})`
            badge.style.color = condColors[condition] || '#888'
          } else {
            badge.innerText = ''
          }
        }
      }
    })

    doc.querySelectorAll('Backpack > Item').forEach((itemNode) => {
      const qty = itemNode.getAttribute('qty') || '1'
      const name = itemNode.textContent || ''
      const div = createInvItem()
      document.getElementById('inv-container')?.appendChild(div)
      ;(div.querySelector('.d-qty') as HTMLInputElement).value = qty
      ;(div.querySelector('.d-name') as HTMLInputElement).value = name
    })

    doc.querySelectorAll('Skill').forEach((skillNode) => {
      const div = createSkillItem()
      document.getElementById('skills-container')?.appendChild(div)
      ;(div.querySelector('.d-name') as HTMLInputElement).value = skillNode.getAttribute('name') || ''
      ;(div.querySelector('.d-lvl') as HTMLInputElement).value = skillNode.getAttribute('level') || '1'
      ;(div.querySelector('.d-desc') as HTMLTextAreaElement).value = skillNode.textContent || ''
      const buffsAttr = skillNode.getAttribute('buffs')
      if (buffsAttr) {
        const container = div.querySelector('.bt-buffs-container')
        buffsAttr.split(';').forEach(pair => {
          const [stat, pct] = pair.split(':')
          if (stat && pct && container) {
            const entry = createBuffEntry(buffTargetDefs)
            ;(entry.querySelector('.bt-buff-stat') as HTMLSelectElement).value = stat.trim()
            ;(entry.querySelector('.bt-buff-pct') as HTMLInputElement).value = pct.trim()
            container.appendChild(entry)
          }
        })
      }
    })

    doc.querySelectorAll('Trait').forEach((traitNode) => {
      const div = createTraitItem()
      document.getElementById('traits-container')?.appendChild(div)
      ;(div.querySelector('.d-name') as HTMLInputElement).value = traitNode.getAttribute('name') || ''
      ;(div.querySelector('.d-desc') as HTMLTextAreaElement).value = traitNode.textContent || ''
      const buffsAttr = traitNode.getAttribute('buffs')
      if (buffsAttr) {
        const container = div.querySelector('.bt-buffs-container')
        buffsAttr.split(';').forEach(pair => {
          const [stat, pct] = pair.split(':')
          if (stat && pct && container) {
            const entry = createBuffEntry(buffTargetDefs)
            ;(entry.querySelector('.bt-buff-stat') as HTMLSelectElement).value = stat.trim()
            ;(entry.querySelector('.bt-buff-pct') as HTMLInputElement).value = pct.trim()
            container.appendChild(entry)
          }
        })
      }
    })

    // Read Stomach-level struggle attributes
    const stomachNode = doc.querySelector('Stomach')
    if (stomachNode) {
      const indigestion = parseFloat(stomachNode.getAttribute('indigestion') || '0') || 0
      const indigestionEvents = stomachNode.getAttribute('indigestionEvents') || ''
      const indBar = document.getElementById('bt-indigestion-bar')
      const indVal = document.getElementById('bt-indigestion-val')
      if (indBar) {
        indBar.style.width = `${Math.min(100, Math.max(0, indigestion))}%`
        indBar.dataset.indigestion = String(indigestion)
        indBar.dataset.indigestionEvents = indigestionEvents
      }
      if (indVal) indVal.textContent = `${Math.round(indigestion)}%`

      const suppressing = stomachNode.getAttribute('suppressing') === 'true'
      const suppressToggle = document.getElementById('bt-suppressing-toggle') as HTMLInputElement
      const suppressLabel = document.getElementById('bt-suppressing-label')
      if (suppressToggle) suppressToggle.checked = suppressing
      if (suppressLabel) suppressLabel.textContent = suppressing ? 'Active' : 'Passive'

      const stomachFatigue = parseFloat(stomachNode.getAttribute('stomachFatigue') || '0') || 0
      const fatigueInfo = document.getElementById('bt-fatigue-info')
      if (fatigueInfo) {
        fatigueInfo.dataset.stomachFatigue = String(stomachFatigue)
        if (stomachFatigue > 20) fatigueInfo.textContent = `Fatigue: High (${Math.round(stomachFatigue)})`
        else if (stomachFatigue > 10) fatigueInfo.textContent = `Fatigue: Moderate (${Math.round(stomachFatigue)})`
        else if (stomachFatigue > 0) fatigueInfo.textContent = `Fatigue: Low (${Math.round(stomachFatigue)})`
        else fatigueInfo.textContent = ''
      }
    }

    doc.querySelectorAll('Stomach > Item').forEach((itemNode) => {
      const div = createStomachItem()
      document.getElementById('stomach-container')?.appendChild(div)

      ;(div.querySelector('.v-name') as HTMLInputElement).value = getAttr(itemNode, 'name')
      ;(div.querySelector('.v-vol') as HTMLInputElement).value = getAttr(itemNode, 'volume_L')
      ;(div.querySelector('.v-dig') as HTMLInputElement).value = (getAttr(itemNode, 'digestion') || '').replace('%', '')

      const type = getAttr(itemNode, 'type') || 'Food'
      const typeSelect = div.querySelector('.v-type') as HTMLSelectElement
      typeSelect.value = type
      typeSelect.dispatchEvent(new Event('change'))

      const appearanceNode = itemNode.querySelector('Appearance')
      ;(div.querySelector('.v-appearance') as HTMLTextAreaElement).value = appearanceNode?.textContent || ''

      const descNode = itemNode.querySelector('Description')
      ;(div.querySelector('.v-flavor') as HTMLTextAreaElement).value = descNode?.textContent || ''

      if (type === 'Prey') {
        const gearNode = itemNode.querySelector('BoundGear')
        ;(div.querySelector('.v-gear') as HTMLTextAreaElement).value = gearNode?.textContent || ''

        const rawWillingness = (getAttr(itemNode, 'willingness') || 'reluctant').toLowerCase()
        const willingness = ['willing', 'reluctant', 'fighting'].includes(rawWillingness) ? rawWillingness : 'reluctant'
        const willingnessSelect = div.querySelector('.v-willingness') as HTMLSelectElement
        if (willingnessSelect) willingnessSelect.value = willingness

        const stamina = parseFloat(getAttr(itemNode, 'stamina') || '100') || 100
        const staminaBar = div.querySelector('.v-stamina-bar') as HTMLElement
        const staminaVal = div.querySelector('.v-stamina-val') as HTMLElement
        if (staminaBar) {
          staminaBar.style.width = `${Math.min(100, Math.max(0, stamina))}%`
          staminaBar.classList.remove('tier-safe', 'tier-mild', 'tier-warn', 'tier-high', 'tier-crit')
          staminaBar.classList.add(stamina < 25 ? 'tier-crit' : stamina < 50 ? 'tier-warn' : 'tier-safe')
        }
        if (staminaVal) staminaVal.textContent = `${Math.round(stamina)}%`

        const struggle = parseFloat(getAttr(itemNode, 'struggle') || '0') || 0
        const struggleVal = div.querySelector('.v-struggle-val') as HTMLElement
        if (struggleVal) struggleVal.textContent = `+${struggle.toFixed(2)}%`
      }

      const digInput = div.querySelector('.item-dig-input') as HTMLInputElement
      if (digInput) digInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    // Parse Bowels: both <Item> (prey, full-tour) and <Remains> (waste), preserving order
    const bowelsNode = doc.querySelector('Bowels')
    if (bowelsNode) {
      Array.from(bowelsNode.children).forEach((child) => {
        if (child.nodeName === 'Item') {
          const div = createStomachItem()
          document.getElementById('bowel-container')?.appendChild(div)

          ;(div.querySelector('.v-name') as HTMLInputElement).value = getAttr(child, 'name')
          ;(div.querySelector('.v-vol') as HTMLInputElement).value = getAttr(child, 'volume_L')
          ;(div.querySelector('.v-dig') as HTMLInputElement).value = (getAttr(child, 'transit') || getAttr(child, 'digestion') || '').replace('%', '')

          // Swap stomach-vol → bowel-vol so volume counts toward bowel fill
          const volInput = div.querySelector('.v-vol') as HTMLInputElement
          volInput.classList.remove('stomach-vol')
          volInput.classList.add('bowel-vol')

          // Mark as transit item and swap label Dig % → Transit %
          div.classList.add('is-transit')
          const digLabel = div.querySelector('.item-dig-input')?.parentElement
          if (digLabel) digLabel.innerHTML = 'Transit %: <input type="number" class="bt-input item-dig-input v-dig bt-transit-input" value="0">'
          // Re-set value after innerHTML swap
          ;(div.querySelector('.v-dig') as HTMLInputElement).value = (getAttr(child, 'transit') || getAttr(child, 'digestion') || '').replace('%', '')

          const type = getAttr(child, 'type') || 'Food'
          const typeSelect = div.querySelector('.v-type') as HTMLSelectElement
          typeSelect.value = type
          typeSelect.dispatchEvent(new Event('change'))

          const appearanceNode = child.querySelector('Appearance')
          ;(div.querySelector('.v-appearance') as HTMLTextAreaElement).value = appearanceNode?.textContent || ''

          const descNode = child.querySelector('Description')
          ;(div.querySelector('.v-flavor') as HTMLTextAreaElement).value = descNode?.textContent || ''

          if (type === 'Prey') {
            const gearNode = child.querySelector('BoundGear')
            ;(div.querySelector('.v-gear') as HTMLTextAreaElement).value = gearNode?.textContent || ''

            const rawWillingness = (getAttr(child, 'willingness') || 'reluctant').toLowerCase()
            const willingness = ['willing', 'reluctant', 'fighting'].includes(rawWillingness) ? rawWillingness : 'reluctant'
            const willingnessSelect = div.querySelector('.v-willingness') as HTMLSelectElement
            if (willingnessSelect) willingnessSelect.value = willingness

            const stamina = parseFloat(getAttr(child, 'stamina') || '100') || 100
            const staminaBar = div.querySelector('.v-stamina-bar') as HTMLElement
            const staminaVal = div.querySelector('.v-stamina-val') as HTMLElement
            if (staminaBar) {
              staminaBar.style.width = `${stamina}%`
              staminaBar.classList.remove('tier-safe', 'tier-mild', 'tier-warn', 'tier-high', 'tier-crit')
              staminaBar.classList.add(stamina < 25 ? 'tier-crit' : stamina < 50 ? 'tier-warn' : 'tier-safe')
            }
            if (staminaVal) staminaVal.textContent = `${Math.round(stamina)}%`

            const struggle = parseFloat(getAttr(child, 'struggle') || '0') || 0
            const struggleVal = div.querySelector('.v-struggle-val') as HTMLElement
            if (struggleVal) struggleVal.textContent = `+${struggle.toFixed(2)}%`
          }

          const digInput = div.querySelector('.item-dig-input') as HTMLInputElement
          if (digInput) digInput.dispatchEvent(new Event('input', { bubbles: true }))
        } else if (child.nodeName === 'Remains') {
          const div = createRemainsItem()
          document.getElementById('bowel-container')?.appendChild(div)
          ;(div.querySelector('.v-name') as HTMLInputElement).value = child.textContent || ''
          ;(div.querySelector('.v-vol') as HTMLInputElement).value = getAttr(child, 'volume_L')
        }
      })
    }

    // Parse Womb
    const wombNode = doc.querySelector('Womb')
    if (wombNode) {
      wombNode.querySelectorAll('Item').forEach((itemNode) => {
        const div = createWombItem()
        document.getElementById('womb-container')?.appendChild(div)

        ;(div.querySelector('.v-name') as HTMLInputElement).value = getAttr(itemNode, 'name')
        ;(div.querySelector('.v-vol') as HTMLInputElement).value = getAttr(itemNode, 'volume_L')
        ;(div.querySelector('.v-dig') as HTMLInputElement).value = (getAttr(itemNode, 'absorption') || '').replace('%', '')

        const type = getAttr(itemNode, 'type') || 'Food'
        const typeSelect = div.querySelector('.v-type') as HTMLSelectElement
        typeSelect.value = type
        typeSelect.dispatchEvent(new Event('change'))

        const appearanceNode = itemNode.querySelector('Appearance')
        ;(div.querySelector('.v-appearance') as HTMLTextAreaElement).value = appearanceNode?.textContent || ''

        const descNode = itemNode.querySelector('Description')
        ;(div.querySelector('.v-flavor') as HTMLTextAreaElement).value = descNode?.textContent || ''

        if (type === 'Prey') {
          const gearNode = itemNode.querySelector('BoundGear')
          ;(div.querySelector('.v-gear') as HTMLTextAreaElement).value = gearNode?.textContent || ''

          const rawWillingness = (getAttr(itemNode, 'willingness') || 'reluctant').toLowerCase()
          const willingness = ['willing', 'reluctant', 'fighting'].includes(rawWillingness) ? rawWillingness : 'reluctant'
          const willingnessSelect = div.querySelector('.v-willingness') as HTMLSelectElement
          if (willingnessSelect) willingnessSelect.value = willingness

          const stamina = parseFloat(getAttr(itemNode, 'stamina') || '100') || 100
          const staminaBar = div.querySelector('.v-stamina-bar') as HTMLElement
          const staminaVal = div.querySelector('.v-stamina-val') as HTMLElement
          if (staminaBar) {
            staminaBar.style.width = `${Math.min(100, Math.max(0, stamina))}%`
            staminaBar.classList.remove('tier-safe', 'tier-mild', 'tier-warn', 'tier-high', 'tier-crit')
            staminaBar.classList.add(stamina < 25 ? 'tier-crit' : stamina < 50 ? 'tier-warn' : 'tier-safe')
          }
          if (staminaVal) staminaVal.textContent = `${Math.round(stamina)}%`
        }

        const digInput = div.querySelector('.item-dig-input') as HTMLInputElement
        if (digInput) digInput.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }

    // Parse Balls
    const ballsNode = doc.querySelector('Balls')
    if (ballsNode) {
      const cumVol = parseFloat(ballsNode.getAttribute('cumVolume') || '0') || 0
      const cumVolEl = document.getElementById('bt-cum-vol')
      if (cumVolEl) cumVolEl.textContent = `${cumVol.toFixed(0)} ml`

      ballsNode.querySelectorAll('Item').forEach((itemNode) => {
        const div = createBallsItem()
        document.getElementById('balls-container')?.appendChild(div)

        ;(div.querySelector('.v-name') as HTMLInputElement).value = getAttr(itemNode, 'name')
        ;(div.querySelector('.v-vol') as HTMLInputElement).value = getAttr(itemNode, 'volume_L')
        ;(div.querySelector('.v-dig') as HTMLInputElement).value = (getAttr(itemNode, 'conversion') || '').replace('%', '')

        const type = getAttr(itemNode, 'type') || 'Food'
        const typeSelect = div.querySelector('.v-type') as HTMLSelectElement
        typeSelect.value = type
        typeSelect.dispatchEvent(new Event('change'))

        const appearanceNode = itemNode.querySelector('Appearance')
        ;(div.querySelector('.v-appearance') as HTMLTextAreaElement).value = appearanceNode?.textContent || ''

        const descNode = itemNode.querySelector('Description')
        ;(div.querySelector('.v-flavor') as HTMLTextAreaElement).value = descNode?.textContent || ''

        if (type === 'Prey') {
          const gearNode = itemNode.querySelector('BoundGear')
          ;(div.querySelector('.v-gear') as HTMLTextAreaElement).value = gearNode?.textContent || ''

          const rawWillingness = (getAttr(itemNode, 'willingness') || 'reluctant').toLowerCase()
          const willingness = ['willing', 'reluctant', 'fighting'].includes(rawWillingness) ? rawWillingness : 'reluctant'
          const willingnessSelect = div.querySelector('.v-willingness') as HTMLSelectElement
          if (willingnessSelect) willingnessSelect.value = willingness

          const stamina = parseFloat(getAttr(itemNode, 'stamina') || '100') || 100
          const staminaBar = div.querySelector('.v-stamina-bar') as HTMLElement
          const staminaVal = div.querySelector('.v-stamina-val') as HTMLElement
          if (staminaBar) {
            staminaBar.style.width = `${Math.min(100, Math.max(0, stamina))}%`
            staminaBar.classList.remove('tier-safe', 'tier-mild', 'tier-warn', 'tier-high', 'tier-crit')
            staminaBar.classList.add(stamina < 25 ? 'tier-crit' : stamina < 50 ? 'tier-warn' : 'tier-safe')
          }
          if (staminaVal) staminaVal.textContent = `${Math.round(stamina)}%`
        }

        const digInput = div.querySelector('.item-dig-input') as HTMLInputElement
        if (digInput) digInput.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }

    // Parse DicePool
    const dicePoolNode = doc.querySelector('DicePool')
    if (dicePoolNode) {
      dicePoolNode.querySelectorAll('Section').forEach((sectionNode) => {
        const name = sectionNode.getAttribute('name') || ''
        if (!name) return
        const sectionDiv = createDiceSection()
        ;(sectionDiv.querySelector('.bt-dice-section-name') as HTMLInputElement).value = name
        sectionNode.querySelectorAll('Die').forEach((dieNode) => {
          const sides = dieNode.getAttribute('sides') || '6'
          const count = dieNode.getAttribute('count') || '1'
          const dieDiv = createDiceEntry()
          ;(dieDiv.querySelector('.bt-dice-sides') as HTMLInputElement).value = sides
          ;(dieDiv.querySelector('.bt-dice-count') as HTMLInputElement).value = count
          sectionDiv.querySelector('.bt-dice-container')?.appendChild(dieDiv)
        })
        document.getElementById('dice-sections-container')?.appendChild(sectionDiv)
      })
    }
    updateDiceEmptyHint()

    updateCapacities()
  }

  // ─── Cleanup ───────────────────────────────────────────────
  return () => {
    removeStyle()
    if (unsubTag) unsubTag()
    panel.remove()
    previewModal.remove()
    floatingBtn.remove()
    ctx.dom.cleanup()
  }
}
