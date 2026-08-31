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
} from './frontend/api'
import {
  buildToggleRow,
  createStomachItem,
  createRemainsItem,
  createBuffEntry,
  createSkillItem,
  createTraitItem,
  createInvItem,
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
          <div class="bt-section-title" style="margin-top: 0;">IDENTITY & BASE</div>
          <input type="text" class="bt-input full bt-scrape" data-id="Name" placeholder="Character Name" id="bt-name">
          <div class="bt-row"><span>Species:</span> <input type="text" class="bt-input bt-input-wide bt-scrape" data-id="Species" id="bt-species"></div>
          <div class="bt-row"><span>Age:</span> <input type="text" class="bt-input bt-input-wide bt-scrape" data-id="Age" id="bt-age"></div>
          <div class="bt-row">
            <span>Gender:</span>
            <div style="display:flex; align-items:center; width: 65%;">
              <input type="text" class="bt-input bt-scrape" data-id="Gender" style="flex:1;" id="bt-gender">
              <span id="bt-gender-icon" style="width: 25px; text-align: right; font-size: 16px;"></span>
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
            <div style="display:flex; align-items:center; width: 65%;">
              <input type="number" class="bt-input bt-scrape" data-id="BreastVolume_ml" style="flex:1;" id="bt-breast-ml" value="0">
              <span id="bt-breast-cup" style="width: 45px; text-align:right; font-weight:bold; color:#ff4444;">AA</span>
            </div>
          </div>
          <input type="text" class="bt-input full bt-scrape" data-id="BreastShape" placeholder="Breast descriptor (e.g., firm, perky)" id="bt-breast-desc">
          <div class="bt-row"><span>Ass (Hips cm):</span> <input type="number" class="bt-input bt-input-wide bt-scrape" data-id="Hips_cm" id="bt-ass-cm" value="90"></div>
          <input type="text" class="bt-input full bt-scrape" data-id="AssShape" placeholder="Ass descriptor (e.g., plump, wide)" id="bt-ass-desc">
          <div class="bt-row"><span>Stomach Resist:</span> <input type="number" class="bt-input bt-input-wide bt-scrape" data-id="StomachResistance" id="bt-stomach-resist" step="0.1" value="1.0"></div>
          <div class="bt-row">
            <span>Penis (L/G cm):</span>
            <div style="display:flex; justify-content:space-between; width: 65%;">
              <input type="number" class="bt-input bt-input-small bt-scrape" data-id="PenisLength_cm" placeholder="Len" id="bt-penis-len">
              <span style="color:#666; margin-top:5px;">x</span>
              <input type="number" class="bt-input bt-input-small bt-scrape" data-id="PenisGirth_cm" placeholder="Girth" id="bt-penis-girth">
            </div>
          </div>
          <input type="text" class="bt-input full bt-scrape" data-id="PenisShape" placeholder="Penis descriptor (e.g., uncut, veiny)" id="bt-penis-desc">
          <div class="bt-row"><span>Current Size (L/G cm):</span> <span class="bt-value" id="bt-penis-current" style="color:#aaa;">0.0 x 0.0</span></div>
          <div class="bt-row"><span>Vagina:</span> <input type="text" class="bt-input bt-input-wide bt-scrape" data-id="Vagina" placeholder="Descriptor..." id="bt-vagina"></div>
          <div style="font-size: 13px; margin-top: 15px; margin-bottom: 5px; color: #888;">Markings & Scars:</div>
          <textarea class="bt-textarea bt-scrape" data-id="ScarsMarkings" rows="2" placeholder="Scars, Tattoos, Piercings..." id="bt-scars"></textarea>
        </div>
        <div id="sub-skills" class="bt-sub-content">
          <div style="margin-bottom: 20px;">
            <div class="bt-row"><span style="font-weight:bold;">Skills</span> <button class="bt-add-btn" id="add-skill-btn">+ Add</button></div>
            <div id="skills-container"></div>
          </div>
          <div>
            <div class="bt-row"><span style="font-weight:bold;">Traits</span> <button class="bt-add-btn" id="add-trait-btn">+ Add</button></div>
            <div id="traits-container"></div>
          </div>
        </div>
        <div id="sub-attr" class="bt-sub-content">
          <div class="bt-section-title" style="margin-top: 0;">ATTRIBUTES</div>
          <div style="font-size: 12px; color: #888; margin-bottom: 12px;">Range 1–20 (default 10). Modifier = ⌊(score−10)/2⌋. The extension applies modifiers automatically.</div>
          <div class="bt-row"><span>STR (Strength):</span> <div style="display:flex; align-items:center; width: 65%;"><input type="number" class="bt-input bt-attr" data-attr="STR" min="1" max="20" value="10" id="bt-attr-str" style="flex:1;"><span class="bt-attr-mod" id="bt-attr-mod-str" style="width:35px; text-align:right; font-weight:bold; color:#aaa;">+0</span></div></div>
          <div class="bt-row"><span>DEX (Dexterity):</span> <div style="display:flex; align-items:center; width: 65%;"><input type="number" class="bt-input bt-attr" data-attr="DEX" min="1" max="20" value="10" id="bt-attr-dex" style="flex:1;"><span class="bt-attr-mod" id="bt-attr-mod-dex" style="width:35px; text-align:right; font-weight:bold; color:#aaa;">+0</span></div></div>
          <div class="bt-row"><span>CON (Constitution):</span> <div style="display:flex; align-items:center; width: 65%;"><input type="number" class="bt-input bt-attr" data-attr="CON" min="1" max="20" value="10" id="bt-attr-con" style="flex:1;"><span class="bt-attr-mod" id="bt-attr-mod-con" style="width:35px; text-align:right; font-weight:bold; color:#aaa;">+0</span></div></div>
          <div class="bt-row"><span>INT (Intelligence):</span> <div style="display:flex; align-items:center; width: 65%;"><input type="number" class="bt-input bt-attr" data-attr="INT" min="1" max="20" value="10" id="bt-attr-int" style="flex:1;"><span class="bt-attr-mod" id="bt-attr-mod-int" style="width:35px; text-align:right; font-weight:bold; color:#aaa;">+0</span></div></div>
          <div class="bt-row"><span>WIS (Wisdom):</span> <div style="display:flex; align-items:center; width: 65%;"><input type="number" class="bt-input bt-attr" data-attr="WIS" min="1" max="20" value="10" id="bt-attr-wis" style="flex:1;"><span class="bt-attr-mod" id="bt-attr-mod-wis" style="width:35px; text-align:right; font-weight:bold; color:#aaa;">+0</span></div></div>
          <div class="bt-row"><span>CHA (Charisma):</span> <div style="display:flex; align-items:center; width: 65%;"><input type="number" class="bt-input bt-attr" data-attr="CHA" min="1" max="20" value="10" id="bt-attr-cha" style="flex:1;"><span class="bt-attr-mod" id="bt-attr-mod-cha" style="width:35px; text-align:right; font-weight:bold; color:#aaa;">+0</span></div></div>
          <div class="bt-section-title" style="margin-top: 15px;">DERIVED EFFECTS</div>
          <div style="font-size: 12px; color: #888; line-height: 1.6;">
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
          <span style="font-weight:bold; color:#ff4444;">WEALTH</span>
          <select id="bt-currency-type" class="bt-select bt-scrape" data-id="CurrencySystem" style="width: 100px;">
            <option value="modern">Modern ($)</option>
            <option value="fantasy">Fantasy (G/S/C)</option>
          </select>
        </div>
        <div id="currency-modern"><input type="number" class="bt-input full bt-scrape" data-id="CashBalance" id="bt-cash-modern" placeholder="Balance (e.g. 1500)"></div>
        <div id="currency-fantasy" style="display:none; justify-content:space-between; gap:5px; margin-bottom:10px;">
          <div style="flex:1; display:flex; align-items:center;"><input type="number" class="bt-input bt-scrape" data-id="Gold" style="width:100%;" placeholder="0"><span style="margin-left:5px; color:#ffd700; font-weight:bold;">G</span></div>
          <div style="flex:1; display:flex; align-items:center;"><input type="number" class="bt-input bt-scrape" data-id="Silver" style="width:100%;" placeholder="0"><span style="margin-left:5px; color:#c0c0c0; font-weight:bold;">S</span></div>
          <div style="flex:1; display:flex; align-items:center;"><input type="number" class="bt-input bt-scrape" data-id="Copper" style="width:100%;" placeholder="0"><span style="margin-left:5px; color:#cd7f32; font-weight:bold;">C</span></div>
        </div>
        <hr style="border-color: #333; margin: 15px 0;">
        <div class="bt-section-title" style="display:flex; justify-content:space-between; align-items:center;">
          CLOTHING SLOTS
          <select class="bt-select bt-scrape" data-id="ClothingMode" id="bt-cloth-mode" style="width:110px; border-color:#ff4444;">
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
        <hr style="border-color: #333; margin: 15px 0;">
        <div class="bt-section-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>BACKPACK / POCKETS</span>
          <button class="bt-add-btn" id="add-inv-btn">+ Add Item</button>
        </div>
        <div id="inv-container" style="margin-top: 10px;"></div>
      </div>
      <div id="tab-state" class="bt-tab-content">
        <div class="bt-section-title" style="margin-top:0;">CORE STATS</div>
        <div class="bt-row"><span>Health:</span> <input type="number" class="bt-input bt-scrape" data-id="Health" id="bt-health" value="100"></div>
        <div class="bt-row" style="align-items:center;">
          <span>Energy:</span>
          <input type="number" class="bt-input bt-scrape" data-id="Energy" id="bt-energy" value="100" style="width:60px;">
          <div style="flex:1; display:flex; align-items:center; gap:6px; margin-left:8px;">
            <div style="flex:1; height:10px; background:#1a1a1a; border:1px solid #333; border-radius:5px; overflow:hidden;">
              <div id="bt-energy-bar" style="height:100%; width:100%; background:#4CAF50; transition:width 0.3s, background 0.3s;"></div>
            </div>
            <span class="bt-value" id="bt-energy-status" style="min-width:65px; text-align:right; font-size:11px; color:#4CAF50;">Energetic</span>
          </div>
        </div>
        <div class="bt-section-title">VITALS</div>
        <div id="bt-arousal-slot" style="margin-bottom: 15px;"></div>
        <div id="bt-climax-slot" style="margin-bottom: 15px;"></div>
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
        <div class="bt-section-title" style="margin-top: 0;">METABOLIC ENGINE</div>
        <div class="bt-row"><span>Acid Level (%):</span> <input type="number" class="bt-input bt-scrape" data-id="CurrentAcidPct" id="bt-acid-level" value="0"></div>
        <div class="bt-row"><span>Base Digestion (%/h):</span> <input type="number" class="bt-input bt-scrape" data-id="BaseDigestionRate" id="bt-dig-base" value="25"></div>
        <div class="bt-row"><span>Acid Rise (%/h):</span> <input type="number" class="bt-input bt-scrape" data-id="AcidRiseRate" id="bt-acid-rise" value="10"></div>
        <div class="bt-row"><span>Capacity Multiplier:</span> <input type="number" class="bt-input bt-scrape" data-id="CapacityMultiplier" id="bt-cap-mult" step="0.1" value="1.0"></div>
        <hr style="border-color: #333; margin: 15px 0;">
        <div class="bt-row"><span>Belly Status:</span> <span class="bt-value" id="bt-belly-status" style="color:#aaa;">Flat</span></div>
        <div class="bt-row"><span>Mobility:</span> <span class="bt-value" id="bt-mobility" style="color:#4CAF50;">Agile / Normal</span></div>
        <hr style="border-color: #333; margin: 15px 0;">
        <div class="bt-section-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>STOMACH PIPELINE</span>
          <button class="bt-add-btn" id="add-stomach-btn">+ Add Item</button>
        </div>
        <div class="bt-row"><span>Max Capacity:</span> <span class="bt-value" id="bt-stom-max-disp">115.20 L</span></div>
        <div class="bt-row"><span>Current Fill:</span> <span class="bt-value" id="bt-stom-fill">0.00 L</span></div>
        <div class="bt-row" style="align-items:center;">
          <span>Indigestion:</span>
          <div style="flex:1; display:flex; align-items:center; gap:6px; margin-left:8px;">
            <div style="flex:1; height:14px; background:#1a1a1a; border:1px solid #333; border-radius:7px; overflow:hidden;">
              <div id="bt-indigestion-bar" style="height:100%; width:0%; background:linear-gradient(90deg, #4CAF50, #FF9800, #f44336); transition:width 0.3s;"></div>
            </div>
            <span class="bt-value" id="bt-indigestion-val" style="min-width:35px; text-align:right;">0%</span>
          </div>
        </div>
        <div class="bt-row" style="align-items:center;">
          <span>Suppressing:</span>
          <label style="display:flex; align-items:center; gap:5px; margin-left:8px; cursor:pointer; font-size:12px;">
            <input type="checkbox" id="bt-suppressing-toggle" style="width:auto; cursor:pointer;">
            <span id="bt-suppressing-label" style="color:#666;">Passive</span>
          </label>
          <span style="font-size:11px; color:#555; margin-left:8px;" id="bt-fatigue-info"></span>
        </div>
        <div class="bt-row" style="align-items:center;">
          <span>Struggle Risk:</span>
          <span class="bt-value" id="bt-struggle-risk" style="margin-left:8px; font-size:12px; font-weight:bold;">None</span>
          <span style="font-size:11px; color:#555; margin-left:8px;" id="bt-struggle-detail"></span>
        </div>
        <div id="stomach-container" style="margin-top: 10px;"></div>
        <hr style="border-color: #333; margin: 15px 0;">
        <div class="bt-section-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>BOWEL PIPELINE</span>
          <button class="bt-add-btn" style="background: #4a3a2a; color: #d2b48c; border-color:#8b6b4a;" id="add-remains-btn">+ Remains</button>
        </div>
        <div class="bt-row"><span>Max Capacity:</span> <span class="bt-value" id="bt-bowel-max-disp">40.32 L</span></div>
        <div class="bt-row"><span>Current Fill:</span> <span class="bt-value" id="bt-bowel-fill">0.00 L</span></div>
        <div id="bowel-container" style="margin-top: 10px;"></div>
        <hr style="border-color: #333; margin: 15px 0;">
        <button class="bt-action-btn" id="bt-sync-btn">💾 Sync Changes to AI</button>
        <button class="bt-action-btn" id="bt-sync-chat-btn" style="background: #2a2a2a; border-color: #555;">🔄 Sync from Latest Message</button>
        <button class="bt-action-btn" id="bt-populate-btn" style="background: #2a2a2a; border-color: #555;">✨ Populate Flagged Fields</button>
      </div>
      <div id="tab-settings" class="bt-tab-content">
        <div class="bt-section-title" style="margin-top: 0;">🔔 TOAST ALERTS</div>
        <div id="bt-toast-settings"></div>
        <hr style="border-color: #333; margin: 15px 0;">
        <div class="bt-section-title">⚙️ ENGINE TOGGLES</div>
        <div id="bt-engine-settings"></div>
        <hr style="border-color: #333; margin: 15px 0;">
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
        <hr style="border-color: #333; margin: 15px 0;">
        <button class="bt-reset-btn" id="bt-set-reset-all" style="color: #ff4444; border-color: #ff4444;">↺ Reset All Settings to Defaults</button>
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
  floatingBtn.innerText = '📋'
  Object.assign(floatingBtn.style, {
    position: 'fixed', bottom: '80px', right: '20px', backgroundColor: '#333', color: '#fff',
    width: '45px', height: '45px', display: 'flex', justifyContent: 'center', alignItems: 'center',
    borderRadius: '10px', fontSize: '22px', cursor: 'pointer', zIndex: '9999', userSelect: 'none',
    transition: 'opacity 0.3s ease', opacity: '0.4', border: '2px solid #555', boxSizing: 'border-box',
  })

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
    floatingBtn.style.left = initialLeft + (touch.clientX - startX) + 'px'
    floatingBtn.style.top = initialTop + (touch.clientY - startY) + 'px'
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

    let bowelTotal = 0
    document.querySelectorAll('.bowel-vol').forEach((el) => {
      bowelTotal += parseFloat((el as HTMLInputElement).value) || 0
    })
    const bowelFillEl = document.getElementById('bt-bowel-fill')
    if (bowelFillEl) bowelFillEl.innerText = bowelTotal.toFixed(2) + ' L'

    const stomPct = (stomTotal / baseStomMax) * 100
    const bellyEl = document.getElementById('bt-belly-status')
    if (bellyEl) {
      if (stomPct <= 5) { bellyEl.innerText = 'Flat'; bellyEl.style.color = '#aaa' }
      else if (stomPct <= 12) { bellyEl.innerText = 'Potbelly'; bellyEl.style.color = '#fff' }
      else if (stomPct <= 20) { bellyEl.innerText = 'Bloated'; bellyEl.style.color = '#ffeb3b' }
      else if (stomPct <= 35) { bellyEl.innerText = 'Full-Term'; bellyEl.style.color = '#ff9800' }
      else if (stomPct <= 48) { bellyEl.innerText = 'Twins'; bellyEl.style.color = '#ff9800' }
      else if (stomPct <= 60) { bellyEl.innerText = 'Triplets'; bellyEl.style.color = '#ff5722' }
      else if (stomPct <= 95) { bellyEl.innerText = 'Same-Size'; bellyEl.style.color = '#ff5722' }
      else if (stomPct <= 125) { bellyEl.innerText = 'Double-Size'; bellyEl.style.color = '#ff4444' }
      else if (stomPct <= 160) { bellyEl.innerText = 'Room-Filling'; bellyEl.style.color = '#ff4444' }
      else { bellyEl.innerText = 'Critical / Bursting'; bellyEl.style.color = '#ff0000' }
    }

    const overCapPct = ((stomTotal + bowelTotal) / baseStomMax) * 100
    const mobEl = document.getElementById('bt-mobility')
    if (mobEl) {
      if (overCapPct <= 100) { mobEl.innerText = 'Agile / Normal'; mobEl.style.color = '#4CAF50' }
      else if (overCapPct <= 110) { mobEl.innerText = 'Slowed, clumsy'; mobEl.style.color = '#ffeb3b' }
      else if (overCapPct <= 125) { mobEl.innerText = 'Half speed, stumbles'; mobEl.style.color = '#ff9800' }
      else if (overCapPct <= 150) { mobEl.innerText = 'Slow waddle only'; mobEl.style.color = '#ff5722' }
      else { mobEl.innerText = 'Immobile'; mobEl.style.color = '#ff4444' }
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

    const riskEl = document.getElementById('bt-struggle-risk')
    const detailEl = document.getElementById('bt-struggle-detail')
    if (riskEl && detailEl) {
      if (preyCount === 0) {
        riskEl.textContent = 'None'
        riskEl.style.color = '#666'
        detailEl.textContent = ''
      } else {
        // Risk score: weighted by fighting prey, indigestion level, and fill ratio
        const fillRatio = baseStomMax > 0 ? totalPreyVolume / baseStomMax : 0
        const riskScore = (fightingCount * 30) + (reluctantCount * 10) + (indigestion * 0.5) + (fillRatio * 15)
        let riskLabel: string
        let riskColor: string
        if (riskScore >= 80 || indigestion >= 90) { riskLabel = 'CRITICAL — Vomit imminent'; riskColor = '#ff0000' }
        else if (riskScore >= 50 || indigestion >= 75) { riskLabel = 'High — Vomit likely soon'; riskColor = '#ff4444' }
        else if (riskScore >= 25 || indigestion >= 50) { riskLabel = 'Moderate — Building pressure'; riskColor = '#ff9800' }
        else if (riskScore >= 10 || indigestion >= 25) { riskLabel = 'Low — Some unrest'; riskColor = '#ffeb3b' }
        else { riskLabel = 'Minimal — Calm'; riskColor = '#4CAF50' }
        riskEl.textContent = riskLabel
        riskEl.style.color = riskColor
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

  // ─── Arousal & Climax Sliders (Native HTML) ────────────────
  const arousalSlot = document.getElementById('bt-arousal-slot')
  const climaxSlot = document.getElementById('bt-climax-slot')

  if (arousalSlot) {
    arousalSlot.innerHTML = `
      <div class="bt-row" style="margin-bottom: 5px;">
        <span style="font-weight: bold; color: #ff4466;">Arousal:</span>
        <span class="bt-value" id="bt-arousal-val" style="color: #ff4466;">0%</span>
      </div>
      <input type="range" id="bt-arousal-slider" min="0" max="100" step="1" value="0" 
        style="width: 100%; accent-color: #ff4466; margin-bottom: 10px; touch-action: manipulation;">
    `
    const arousalInput = document.getElementById('bt-arousal-slider') as HTMLInputElement
    const arousalVal = document.getElementById('bt-arousal-val')
    
    arousalInput?.addEventListener('input', () => {
      const v = parseInt(arousalInput.value) || 0
      if (arousalVal) arousalVal.textContent = v + '%'
      updateCurrentPenisSize(v)
    })
  }

  if (climaxSlot) {
    climaxSlot.innerHTML = `
      <div class="bt-row" style="margin-bottom: 5px;">
        <span style="font-weight: bold; color: #ffaa00;">Climax:</span>
        <span class="bt-value" id="bt-climax-val" style="color: #ffaa00;">0%</span>
      </div>
      <input type="range" id="bt-climax-slider" min="0" max="100" step="1" value="0" disabled
        style="width: 100%; accent-color: #ffaa00; opacity: 0.7; touch-action: manipulation;">
    `
  }

  function setArousalSlider(v: number) {
    const input = document.getElementById('bt-arousal-slider') as HTMLInputElement
    const val = document.getElementById('bt-arousal-val')
    if (input) input.value = String(v)
    if (val) val.textContent = v + '%'
    updateCurrentPenisSize(v)
  }

  function setClimaxSlider(v: number) {
    const input = document.getElementById('bt-climax-slider') as HTMLInputElement
    const val = document.getElementById('bt-climax-val')
    if (input) input.value = String(v)
    if (val) val.textContent = v + '%'
  }

  function updateEnergyDisplay() {
    const energyInput = document.getElementById('bt-energy') as HTMLInputElement
    if (!energyInput) return
    const v = Math.max(0, Math.min(100, parseInt(energyInput.value) || 0))
    const bar = document.getElementById('bt-energy-bar')
    const status = document.getElementById('bt-energy-status')
    if (bar) {
      bar.style.width = v + '%'
      if (v >= 75) bar.style.background = '#4CAF50'
      else if (v >= 50) bar.style.background = '#8BC34A'
      else if (v >= 25) bar.style.background = '#FF9800'
      else if (v >= 10) bar.style.background = '#ff5722'
      else bar.style.background = '#f44336'
    }
    if (status) {
      let label: string
      let color: string
      if (v >= 75) { label = 'Energetic'; color = '#4CAF50' }
      else if (v >= 50) { label = 'Steady'; color = '#8BC34A' }
      else if (v >= 25) { label = 'Tired'; color = '#FF9800' }
      else if (v >= 10) { label = 'Exhausted'; color = '#ff5722' }
      else { label = 'Collapsing'; color = '#f44336' }
      status.textContent = label
      status.style.color = color
    }
  }

  document.getElementById('bt-energy')?.addEventListener('input', updateEnergyDisplay)

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
    if (target.classList.contains('stomach-vol') || target.classList.contains('bowel-vol')) {
      updateCapacities()
    }
    if (target.classList.contains('item-dig-input')) {
      const val = parseInt((target as HTMLInputElement).value) || 0
      const slot = target.closest('.vital-slot')
      const statusSpan = slot?.querySelector('.item-status') as HTMLElement
      if (statusSpan && slot && !slot.classList.contains('is-liquid')) {
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
  })

  panel.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const action = target.getAttribute('data-action')
    if (!action) return

    if (action === 'remove-stomach' || action === 'remove-remains') {
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
  document.getElementById('add-skill-btn')?.addEventListener('click', () => {
    document.getElementById('skills-container')?.appendChild(createSkillItem())
  })
  document.getElementById('add-trait-btn')?.addEventListener('click', () => {
    document.getElementById('traits-container')?.appendChild(createTraitItem())
  })
  document.getElementById('add-inv-btn')?.addEventListener('click', () => {
    document.getElementById('inv-container')?.appendChild(createInvItem())
  })

  // ─── Flag buttons on fields ────────────────────────────────
  function addFlagButtons() {
    // Fields that are auto-managed and should never get a pin button.
    const skipFieldIds = new Set(['Health', 'Energy'])
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

      if (row) {
        container = row as HTMLElement
      } else {
        const parent = input.parentElement
        if (!parent) return
        const wrapper = document.createElement('div')
        wrapper.className = 'bt-flag-wrap'
        parent.insertBefore(wrapper, input)
        wrapper.appendChild(input)
        container = wrapper
      }

      if (container.querySelector('.bt-flag-btn')) return
      container.style.position = 'relative'

      // For right-aligned number inputs, reserve space on the right so the
      // flag button (positioned at right:4px) doesn't cover the value.
      if (
        input.tagName === 'INPUT' &&
        (input as HTMLInputElement).type === 'number'
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
    xml += `    <Stomach current="${stomFill}" max="${stomMax}" suppressing="${suppressing}">\n`

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
        itemAttrs += ` willingness="${willingness}" stamina="${stamina}"`
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

        let itemAttrs = `type="${type}" name="${name}" volume_L="${vol}" digestion="${dig}%"`
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
      }
    })

    xml += `    </Bowels>\n  </DigestiveTract>\n</CharacterSheet>`
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
        btn.style.background = '#333'
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
    if (btn) { btn.innerText = '⏳ Syncing...'; btn.style.background = '#555' }
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
          btn.style.background = '#2a2a2a'
        }, 2000)
      }
      return
    }

    populateInProgress = true
    if (btn) { btn.innerText = '⏳ Populating...'; btn.style.background = '#555' }
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
    if (msg.type === 'SHEET_UPDATED' && msg.xml) {
      try { populateFormFromXml(msg.xml) } catch (e) {}
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
              btn.style.background = '#2a2a2a'
            }, 2000)
          }
        } catch (e) {
          if (btn) {
            btn.innerText = '⚠️ Parse Error'
            btn.style.background = '#ff4444'
            setTimeout(() => {
              btn.innerText = '🔄 Sync from Latest Message'
              btn.style.background = '#2a2a2a'
            }, 2000)
          }
        }
      } else {
        if (btn) {
          btn.innerText = '⚠️ No Sheet Found'
          btn.style.background = '#ff4444'
          setTimeout(() => {
            btn.innerText = '🔄 Sync from Latest Message'
            btn.style.background = '#2a2a2a'
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
            btn.style.background = '#2a2a2a'
          }, 2000)
        }
      } else {
        if (btn) {
          btn.innerText = '⚠️ Populate Failed'
          btn.style.background = '#ff4444'
          setTimeout(() => {
            btn.innerText = '✨ Populate Flagged Fields'
            btn.style.background = '#2a2a2a'
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
        if (updateXml) {
          try { populateFormFromXml(updateXml) } catch (e) {}
        }
      }
    }
  })

  // ─── XML to form parser ────────────────────────────────────
  function populateFormFromXml(xml: string) {
    document.querySelectorAll(
      '.dyn-skill, .dyn-trait, .dyn-inv, #stomach-container .vital-slot, #bowel-container .vital-slot'
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
      const indBar = document.getElementById('bt-indigestion-bar')
      const indVal = document.getElementById('bt-indigestion-val')
      if (indBar) indBar.style.width = `${Math.min(100, Math.max(0, indigestion))}%`
      if (indVal) indVal.textContent = `${Math.round(indigestion)}%`

      const suppressing = stomachNode.getAttribute('suppressing') === 'true'
      const suppressToggle = document.getElementById('bt-suppressing-toggle') as HTMLInputElement
      const suppressLabel = document.getElementById('bt-suppressing-label')
      if (suppressToggle) suppressToggle.checked = suppressing
      if (suppressLabel) suppressLabel.textContent = suppressing ? 'Active' : 'Passive'

      const stomachFatigue = parseFloat(stomachNode.getAttribute('stomachFatigue') || '0') || 0
      const fatigueInfo = document.getElementById('bt-fatigue-info')
      if (fatigueInfo) {
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

        const willingness = getAttr(itemNode, 'willingness') || 'reluctant'
        const willingnessSelect = div.querySelector('.v-willingness') as HTMLSelectElement
        if (willingnessSelect) willingnessSelect.value = willingness

        const stamina = parseFloat(getAttr(itemNode, 'stamina') || '100') || 100
        const staminaBar = div.querySelector('.v-stamina-bar') as HTMLElement
        const staminaVal = div.querySelector('.v-stamina-val') as HTMLElement
        if (staminaBar) {
          staminaBar.style.width = `${Math.min(100, Math.max(0, stamina))}%`
          staminaBar.style.background = stamina < 25 ? '#f44336' : stamina < 50 ? '#FF9800' : '#4CAF50'
        }
        if (staminaVal) staminaVal.textContent = `${Math.round(stamina)}%`
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
          ;(div.querySelector('.v-dig') as HTMLInputElement).value = (getAttr(child, 'digestion') || '').replace('%', '')

          // Swap stomach-vol → bowel-vol so volume counts toward bowel fill
          const volInput = div.querySelector('.v-vol') as HTMLInputElement
          volInput.classList.remove('stomach-vol')
          volInput.classList.add('bowel-vol')

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

            const willingness = getAttr(child, 'willingness') || 'reluctant'
            const willingnessSelect = div.querySelector('.v-willingness') as HTMLSelectElement
            if (willingnessSelect) willingnessSelect.value = willingness

            const stamina = parseFloat(getAttr(child, 'stamina') || '100') || 100
            const staminaBar = div.querySelector('.v-stamina-bar') as HTMLElement
            const staminaVal = div.querySelector('.v-stamina-val') as HTMLElement
            if (staminaBar) {
              staminaBar.style.width = `${stamina}%`
              staminaBar.style.background = stamina < 25 ? '#f44336' : stamina < 50 ? '#FF9800' : '#4CAF50'
            }
            if (staminaVal) staminaVal.textContent = `${Math.round(stamina)}%`
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
