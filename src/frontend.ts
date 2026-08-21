import type { SpindleFrontendContext } from 'lumiverse-spindle-types';

export function setup(ctx: SpindleFrontendContext) {
  const style = document.createElement('style');
  style.innerHTML = `
    #bio-tracker-panel { position: fixed; top: 0; right: -400px; width: 350px; max-width: 100vw; height: 100%; background: #1a1a1a; color: #e0e0e0; z-index: 10000; transition: right 0.3s ease-in-out; box-shadow: -5px 0 20px rgba(0,0,0,0.6); display: flex; flex-direction: column; font-family: system-ui, -apple-system, sans-serif; border-left: 1px solid #333; }
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
    .bt-action-btn { width: 100%; padding: 12px; background: #333; color: white; border: 1px solid #444; border-radius: 4px; cursor: pointer; margin-bottom: 10px; font-weight: bold; transition: background 0.2s; }
    .slot-label { font-size: 11px; color: #888; text-transform: uppercase; margin-bottom: 2px; display: block; }
    .flex-row { display: flex; justify-content: space-between; align-items: center; }
    .vital-slot { background: #222; border: 1px dashed #555; border-radius: 6px; padding: 8px; margin-bottom: 8px; position: relative; }
    .vital-remove { position: absolute; top: 5px; right: 5px; background: none; border: none; color: #ff4444; cursor: pointer; font-size: 14px; }
    #bt-preview-modal { position: fixed; top: 10%; left: 5%; width: 90%; height: 80%; background: #111; border: 2px solid #ff4444; border-radius: 8px; z-index: 100000; display: none; flex-direction: column; box-shadow: 0 10px 30px rgba(0,0,0,0.8); }
    #bt-preview-header { background: #222; padding: 10px; font-weight: bold; display: flex; justify-content: space-between; color: #ff4444; border-bottom: 1px solid #444; }
    #bt-preview-content { flex: 1; overflow-y: auto; padding: 15px; color: #a5d6a7; font-family: monospace; font-size: 12px; white-space: pre-wrap; }
    #bt-preview-close { background: #ff4444; color: white; border: none; padding: 12px; font-weight: bold; cursor: pointer; border-radius: 0 0 6px 6px; }
  `;
  document.head.appendChild(style);

  const previewModal = document.createElement('div');
  previewModal.id = 'bt-preview-modal';
  previewModal.innerHTML = `
    <div id="bt-preview-header"><span>XML Data Output</span></div>
    <div id="bt-preview-content"></div>
    <button id="bt-preview-close">✖ Close Preview</button>
  `;
  document.body.appendChild(previewModal);
  document.getElementById('bt-preview-close')?.addEventListener('click', () => previewModal.style.display = 'none');

  const panel = document.createElement('div');
  panel.id = 'bio-tracker-panel';
  panel.innerHTML = `
    <div class="bt-header">
      <span>📋 Character Sheet</span>
      <span class="bt-close" id="bt-close-btn">✖</span>
    </div>
    <div class="bt-tabs">
      <button class="bt-tab-btn active" data-tab="tab-char">Character</button>
      <button class="bt-tab-btn" data-tab="tab-inv">Inventory</button>
      <button class="bt-tab-btn" data-tab="tab-state">State</button>
      <button class="bt-tab-btn" data-tab="tab-vitals">Vitals</button>
    </div>

    <div class="bt-content">
      <div id="tab-char" class="bt-tab-content active">
        <div class="bt-sub-tabs">
          <button class="bt-sub-btn active" data-sub="sub-app">Appearance</button>
          <button class="bt-sub-btn" data-sub="sub-skills">Skills & Traits</button>
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
          <div class="bt-row">
            <span>Penis (L/G cm):</span> 
            <div style="display:flex; justify-content:space-between; width: 65%;">
              <input type="number" class="bt-input bt-input-small bt-scrape" data-id="PenisLength_cm" placeholder="Len" id="bt-penis-len">
              <span style="color:#666; margin-top:5px;">x</span>
              <input type="number" class="bt-input bt-input-small bt-scrape" data-id="PenisGirth_cm" placeholder="Girth" id="bt-penis-girth">
            </div>
          </div>
          <input type="text" class="bt-input full bt-scrape" data-id="PenisShape" placeholder="Penis descriptor (e.g., uncut, veiny)" id="bt-penis-desc">
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
        <div class="bt-row"><span>Energy:</span> <input type="number" class="bt-input bt-scrape" data-id="Energy" id="bt-energy" value="100"></div>
        
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
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  const floatingBtn = document.createElement('div');
  floatingBtn.innerText = '📋';
  Object.assign(floatingBtn.style, {
    position: 'fixed', bottom: '80px', right: '20px', backgroundColor: '#333', color: '#fff',
    width: '45px', height: '45px', display: 'flex', justifyContent: 'center', alignItems: 'center',
    borderRadius: '10px', fontSize: '22px', cursor: 'pointer', zIndex: '9999',
    userSelect: 'none', transition: 'opacity 0.3s ease', opacity: '0.4', border: '2px solid #555',
    boxSizing: 'border-box'
  });
  
  const savedPos = localStorage.getItem('bio-tracker-btn-pos');
  if (savedPos) {
    try {
      const pos = JSON.parse(savedPos);
      floatingBtn.style.bottom = 'auto'; floatingBtn.style.right = 'auto';
      floatingBtn.style.left = pos.x + 'px'; floatingBtn.style.top = pos.y + 'px';
    } catch(e) {}
  }
  document.body.appendChild(floatingBtn);

  let fadeTimeout: any;
  const resetFade = () => {
    floatingBtn.style.opacity = '1';
    clearTimeout(fadeTimeout);
    fadeTimeout = setTimeout(() => { floatingBtn.style.opacity = '0.4'; }, 3000);
  };
  resetFade();

  let isDragging = false, hasMoved = false;
  let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;

  floatingBtn.addEventListener('touchstart', (e) => {
    isDragging = true; hasMoved = false; resetFade();
    const touch = e.touches[0];
    const rect = floatingBtn.getBoundingClientRect();
    startX = touch.clientX; startY = touch.clientY;
    initialLeft = rect.left; initialTop = rect.top;
    floatingBtn.style.bottom = 'auto'; floatingBtn.style.right = 'auto';
    floatingBtn.style.left = initialLeft + 'px'; floatingBtn.style.top = initialTop + 'px';
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    if (Math.abs(touch.clientX - startX) > 5 || Math.abs(touch.clientY - startY) > 5) hasMoved = true;
    floatingBtn.style.left = (initialLeft + (touch.clientX - startX)) + 'px';
    floatingBtn.style.top = (initialTop + (touch.clientY - startY)) + 'px';
  }, { passive: true });

  document.addEventListener('touchend', () => { 
    if (isDragging) {
      localStorage.setItem('bio-tracker-btn-pos', JSON.stringify({
        x: parseFloat(floatingBtn.style.left), y: parseFloat(floatingBtn.style.top)
      }));
    }
    isDragging = false; resetFade(); 
  });

  floatingBtn.addEventListener('click', () => {
    if (!hasMoved) { panel.classList.add('open'); floatingBtn.style.display = 'none'; }
  });
  
  document.getElementById('bt-close-btn')?.addEventListener('click', () => { 
    panel.classList.remove('open'); floatingBtn.style.display = 'flex'; resetFade();
  });

  panel.querySelectorAll('.bt-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      panel.querySelectorAll('.bt-tab-btn, .bt-tab-content').forEach(el => el.classList.remove('active'));
      (e.target as HTMLElement).classList.add('active');
      document.getElementById((e.target as HTMLElement).dataset.tab!)?.classList.add('active');
    });
  });

  panel.querySelectorAll('.bt-sub-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      panel.querySelectorAll('.bt-sub-btn, .bt-sub-content').forEach(el => el.classList.remove('active'));
      (e.target as HTMLElement).classList.add('active');
      document.getElementById((e.target as HTMLElement).dataset.sub!)?.classList.add('active');
    });
  });

  const currencyType = document.getElementById('bt-currency-type') as HTMLSelectElement;
  currencyType?.addEventListener('change', () => {
    document.getElementById('currency-modern')!.style.display = currencyType.value === 'modern' ? 'block' : 'none';
    document.getElementById('currency-fantasy')!.style.display = currencyType.value === 'fantasy' ? 'flex' : 'none';
  });

  function updateCapacities() {
    const height = parseFloat((document.getElementById('bt-height') as HTMLInputElement).value) || 160;
    const weight = parseFloat((document.getElementById('bt-weight') as HTMLInputElement).value) || 60;
    const mult = parseFloat((document.getElementById('bt-cap-mult') as HTMLInputElement).value) || 1.0;

    const baseStomMax = (height * weight * 0.012) * mult;
    const baseBowelMax = baseStomMax * 0.35; 

    const stomMaxDisp = document.getElementById('bt-stom-max-disp');
    if (stomMaxDisp) stomMaxDisp.innerText = baseStomMax.toFixed(2) + ' L';
    const bowelMaxDisp = document.getElementById('bt-bowel-max-disp');
    if (bowelMaxDisp) bowelMaxDisp.innerText = baseBowelMax.toFixed(2) + ' L';

    let stomTotal = 0;
    document.querySelectorAll('.stomach-vol').forEach(el => {
      stomTotal += parseFloat((el as HTMLInputElement).value) || 0;
    });
    const stomFillEl = document.getElementById('bt-stom-fill');
    if(stomFillEl) stomFillEl.innerText = stomTotal.toFixed(2) + ' L';

    let bowelTotal = 0;
    document.querySelectorAll('.bowel-vol').forEach(el => {
      bowelTotal += parseFloat((el as HTMLInputElement).value) || 0;
    });
    const bowelFillEl = document.getElementById('bt-bowel-fill');
    if(bowelFillEl) bowelFillEl.innerText = bowelTotal.toFixed(2) + ' L';

    let stomPct = (stomTotal / baseStomMax) * 100;
    let bellyEl = document.getElementById('bt-belly-status');
    if (bellyEl) {
      if (stomPct <= 5) { bellyEl.innerText = 'Flat'; bellyEl.style.color = '#aaa'; }
      else if (stomPct <= 12) { bellyEl.innerText = 'Potbelly'; bellyEl.style.color = '#fff'; }
      else if (stomPct <= 20) { bellyEl.innerText = 'Bloated'; bellyEl.style.color = '#ffeb3b'; }
      else if (stomPct <= 35) { bellyEl.innerText = 'Full-Term'; bellyEl.style.color = '#ff9800'; }
      else if (stomPct <= 48) { bellyEl.innerText = 'Twins'; bellyEl.style.color = '#ff9800'; }
      else if (stomPct <= 60) { bellyEl.innerText = 'Triplets'; bellyEl.style.color = '#ff5722'; }
      else if (stomPct <= 95) { bellyEl.innerText = 'Same-Size'; bellyEl.style.color = '#ff5722'; }
      else if (stomPct <= 125) { bellyEl.innerText = 'Double-Size'; bellyEl.style.color = '#ff4444'; }
      else if (stomPct <= 160) { bellyEl.innerText = 'Room-Filling'; bellyEl.style.color = '#ff4444'; }
      else { bellyEl.innerText = 'Critical / Bursting'; bellyEl.style.color = '#ff0000'; }
    }

    let overCapPct = ((stomTotal + bowelTotal) / baseStomMax) * 100;
    let mobEl = document.getElementById('bt-mobility');
    if (mobEl) {
      if (overCapPct <= 100) { mobEl.innerText = 'Agile / Normal'; mobEl.style.color = '#4CAF50'; }
      else if (overCapPct <= 110) { mobEl.innerText = 'Slowed, clumsy'; mobEl.style.color = '#ffeb3b'; }
      else if (overCapPct <= 125) { mobEl.innerText = 'Half speed, stumbles'; mobEl.style.color = '#ff9800'; }
      else if (overCapPct <= 150) { mobEl.innerText = 'Slow waddle only'; mobEl.style.color = '#ff5722'; }
      else { mobEl.innerText = 'Immobile'; mobEl.style.color = '#ff4444'; }
    }
  }

  document.getElementById('bt-height')?.addEventListener('input', updateCapacities);
  document.getElementById('bt-weight')?.addEventListener('input', updateCapacities);
  document.getElementById('bt-cap-mult')?.addEventListener('input', updateCapacities);

  panel.addEventListener('input', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('stomach-vol') || target.classList.contains('bowel-vol')) { updateCapacities(); }
    if (target.classList.contains('item-dig-input')) {
      const val = parseInt((target as HTMLInputElement).value) || 0;
      const statusSpan = target.closest('.vital-slot')?.querySelector('.item-status') as HTMLElement;
      const slot = target.closest('.vital-slot');
      if (statusSpan && slot && !slot.classList.contains('is-liquid')) {
        let text = 'Fully Conscious'; let color = '#4CAF50';
        if (val >= 90) { text = 'Dead'; color = '#ff4444'; }
        else if (val >= 80) { text = 'Unconscious'; color = '#999'; }
        else if (val >= 70) { text = 'Drowsy'; color = '#ffeb3b'; }
        else if (val >= 50) { text = 'Conscious'; color = '#ff9800'; }
        statusSpan.innerText = text; statusSpan.style.color = color;
      }
    }
  });

  document.getElementById('add-stomach-btn')?.addEventListener('click', () => {
    const div = document.createElement('div'); div.className = 'vital-slot is-food';
    div.innerHTML = `
      <button class="vital-remove" onclick="this.parentElement.remove(); document.getElementById('bt-cap-mult').dispatchEvent(new Event('input', {bubbles:true}))">✖</button>
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
      <div class="flex-row" style="margin-bottom: 5px;">
        <span>Vol (L): <input type="number" class="bt-input stomach-vol v-vol" style="width: 50px;" value="0"></span>
        <span>Dig %: <input type="number" class="bt-input item-dig-input v-dig" style="width: 40px;" value="0"></span>
      </div>
      <textarea class="bt-textarea v-flavor" rows="2" style="margin-bottom: 5px;" placeholder="Description / Action (e.g. thrashing, sloshing)..."></textarea>
      <textarea class="bt-textarea v-gear" rows="2" style="margin-bottom: 0; display: none;" placeholder="Bound Gear / Items..."></textarea>
    `;
    document.getElementById('stomach-container')?.appendChild(div);
    
    const typeSelect = div.querySelector('.v-type') as HTMLSelectElement;
    const gearArea = div.querySelector('.v-gear') as HTMLTextAreaElement;
    const statusSpan = div.querySelector('.item-status') as HTMLElement;
    
    typeSelect.addEventListener('change', () => {
      if (typeSelect.value === 'Prey') {
        gearArea.style.display = 'block';
        div.classList.remove('is-food', 'is-liquid'); div.classList.add('is-prey');
        statusSpan.style.display = 'inline';
      } else if (typeSelect.value === 'Liquid') {
        gearArea.style.display = 'none';
        div.classList.remove('is-prey', 'is-food'); div.classList.add('is-liquid');
        statusSpan.style.display = 'none';
      } else {
        gearArea.style.display = 'none';
        div.classList.remove('is-prey', 'is-liquid'); div.classList.add('is-food');
        statusSpan.style.display = 'none';
      }
    });
  });

  document.getElementById('add-remains-btn')?.addEventListener('click', () => {
    const div = document.createElement('div'); div.className = 'vital-slot is-remains'; div.style.borderColor = '#8b6b4a';
    div.innerHTML = `
      <button class="vital-remove" onclick="this.parentElement.remove(); document.getElementById('bt-cap-mult').dispatchEvent(new Event('input', {bubbles:true}))">✖</button>
      <div class="flex-row" style="margin-bottom: 5px; margin-right: 15px;">
        <input type="text" class="bt-input v-name" style="flex:1; text-align:left;" placeholder="Waste / Remains Name..."></div>
      <div class="flex-row">
        <span>Vol (L): <input type="number" class="bt-input bowel-vol v-vol" style="width: 50px;" value="0"></span>
      </div>
    `;
    document.getElementById('bowel-container')?.appendChild(div);
  });

  document.getElementById('add-skill-btn')?.addEventListener('click', () => {
    const div = document.createElement('div'); div.className = 'bt-dynamic-item dyn-skill';
    div.innerHTML = `<button class="bt-remove-btn" onclick="this.parentElement.remove()">✖</button><input type="text" class="bt-input full d-name" style="width: 60%;" placeholder="Skill Name"><input type="number" class="bt-input d-lvl" style="width: 30%; position:absolute; top:10px; right: 40px;" placeholder="Lvl"><textarea class="bt-textarea d-desc" rows="2" placeholder="Description..."></textarea>`;
    document.getElementById('skills-container')?.appendChild(div);
  });
  document.getElementById('add-trait-btn')?.addEventListener('click', () => {
    const div = document.createElement('div'); div.className = 'bt-dynamic-item dyn-trait';
    div.innerHTML = `<button class="bt-remove-btn" onclick="this.parentElement.remove()">✖</button><input type="text" class="bt-input full d-name" style="width: 80%;" placeholder="Trait Name"><textarea class="bt-textarea d-desc" rows="2" placeholder="Description..."></textarea>`;
    document.getElementById('traits-container')?.appendChild(div);
  });
  document.getElementById('add-inv-btn')?.addEventListener('click', () => {
    const div = document.createElement('div'); div.className = 'bt-row dyn-inv'; div.style.cssText = 'margin-bottom: 5px; background: #222; padding: 5px; border-radius: 4px; border: 1px dashed #444;';
    div.innerHTML = `<input type="number" class="bt-input d-qty" style="width: 40px; text-align: center; padding: 4px;" placeholder="#" value="1"><input type="text" class="bt-input full d-name" style="margin-bottom: 0; flex: 1; margin-left: 5px;" placeholder="Item name..."><button style="background: transparent; border: none; color: #ff4444; cursor: pointer; font-size: 16px; margin-left: 5px;" onclick="this.parentElement.remove()">✖</button>`;
    document.getElementById('inv-container')?.appendChild(div);
  });

  document.getElementById('bt-sync-btn')?.addEventListener('click', () => {
    let xml = `<CharacterSheet>\n  <State>\n`;
    document.querySelectorAll('.bt-scrape').forEach(el => {
      const input = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      const val = input.value.trim();
      const id = input.getAttribute('data-id');
      if (val !== '' && val !== '0' && id && ['Health', 'Energy', 'Time', 'Weather', 'Temperature', 'Area', 'Building', 'Room'].includes(id)) {
        xml += `    <${id}>${val}</${id}>\n`;
      }
    });
    xml += `  </State>\n\n  <BaseStats>\n`;
    document.querySelectorAll('.bt-scrape').forEach(el => {
      const input = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      const val = input.value.trim();
      const id = input.getAttribute('data-id');
      if (val !== '' && val !== '0' && id && !['Health', 'Energy', 'Time', 'Weather', 'Temperature', 'Area', 'Building', 'Room'].includes(id)) {
        xml += `    <${id}>${val}</${id}>\n`;
      }
    });
    xml += `  </BaseStats>\n\n  <Clothing>\n`;
    document.querySelectorAll('.bt-cloth-slot').forEach(el => {
      const input = el as HTMLInputElement;
      const val = input.value.trim();
      const slot = input.getAttribute('data-slot');
      if (val !== '') {
        const flexEl = input.previousElementSibling?.querySelector('.bt-cloth-flex') as HTMLSelectElement;
        const flexStr = flexEl ? ` elasticity="${flexEl.value}"` : '';
        xml += `    <Equip slot="${slot}"${flexStr}>${val}</Equip>\n`;
      }
    });
    xml += `  </Clothing>\n\n  <Backpack>\n`;
    document.querySelectorAll('.dyn-inv').forEach(el => {
      const qty = (el.querySelector('.d-qty') as HTMLInputElement)?.value.trim() || '1';
      const name = (el.querySelector('.d-name') as HTMLInputElement)?.value.trim();
      if(name) xml += `    <Item qty="${qty}">${name}</Item>\n`;
    });
    xml += `  </Backpack>\n\n  <SkillsAndTraits>\n`;
    document.querySelectorAll('.dyn-skill').forEach(el => {
      const name = (el.querySelector('.d-name') as HTMLInputElement)?.value.trim();
      const lvl = (el.querySelector('.d-lvl') as HTMLInputElement)?.value.trim() || '1';
      const desc = (el.querySelector('.d-desc') as HTMLTextAreaElement)?.value.trim();
      if(name) xml += `    <Skill name="${name}" level="${lvl}">${desc}</Skill>\n`;
    });
    document.querySelectorAll('.dyn-trait').forEach(el => {
      const name = (el.querySelector('.d-name') as HTMLInputElement)?.value.trim();
      const desc = (el.querySelector('.d-desc') as HTMLTextAreaElement)?.value.trim();
      if(name) xml += `    <Trait name="${name}">${desc}</Trait>\n`;
    });
    xml += `  </SkillsAndTraits>\n\n  <DigestiveTract>\n`;
    
    const bellyStatus = document.getElementById('bt-belly-status')?.innerText || 'Flat';
    const mobility = document.getElementById('bt-mobility')?.innerText || 'Agile';
    const stomFill = document.getElementById('bt-stom-fill')?.innerText || '0 L';
    const stomMax = document.getElementById('bt-stom-max-disp')?.innerText || '0 L';
    const bowFill = document.getElementById('bt-bowel-fill')?.innerText || '0 L';
    
    xml += `    <Status belly="${bellyStatus}" mobility="${mobility}" />\n`;
    xml += `    <Stomach current="${stomFill}" max="${stomMax}">\n`;
    
    document.querySelectorAll('#stomach-container .vital-slot').forEach(el => {
      const name = (el.querySelector('.v-name') as HTMLInputElement)?.value.trim() || 'Unknown';
      const vol = (el.querySelector('.v-vol') as HTMLInputElement)?.value.trim() || '0';
      const dig = (el.querySelector('.v-dig') as HTMLInputElement)?.value.trim() || '0';
      const type = (el.querySelector('.v-type') as HTMLSelectElement)?.value || 'Food';
      const flavor = (el.querySelector('.v-flavor') as HTMLTextAreaElement)?.value.trim();
      const gear = (el.querySelector('.v-gear') as HTMLTextAreaElement)?.value.trim();
      
      xml += `      <Item type="${type}" name="${name}" volume_L="${vol}" digestion="${dig}%">\n`;
      if (flavor) xml += `        <Description>${flavor}</Description>\n`;
      if (type === 'Prey' && gear) xml += `        <BoundGear>${gear}</BoundGear>\n`;
      xml += `      </Item>\n`;
    });
    
    xml += `    </Stomach>\n    <Bowels current="${bowFill}">\n`;
    document.querySelectorAll('#bowel-container .vital-slot').forEach(el => {
      const name = (el.querySelector('.v-name') as HTMLInputElement)?.value.trim() || 'Waste';
      const vol = (el.querySelector('.v-vol') as HTMLInputElement)?.value.trim() || '0';
      xml += `      <Remains volume_L="${vol}">${name}</Remains>\n`;
    });
    
    xml += `    </Bowels>\n  </DigestiveTract>\n</CharacterSheet>`;

    const btn = document.getElementById('bt-sync-btn');
    if (btn) {
      btn.innerText = '✅ Data Synced to AI!';
      btn.style.background = '#4CAF50';
      setTimeout(() => { btn.innerText = '💾 Sync Changes to AI'; btn.style.background = '#333'; }, 2000);
    }
    ctx.sendToBackend({ type: 'SYNC_BIO_DATA', xmlData: xml });

    const previewContent = document.getElementById('bt-preview-content');
    if (previewContent) {
      previewContent.innerText = xml;
      document.getElementById('bt-preview-modal')!.style.display = 'flex';
    }
  });

  const breastInput = document.getElementById('bt-breast-ml') as HTMLInputElement;
  const breastCup = document.getElementById('bt-breast-cup') as HTMLSpanElement;
  breastInput?.addEventListener('input', () => {
    const ml = parseInt(breastInput.value) || 0; let cup = "AA";
    if (ml >= 1000) cup = "H+"; else if (ml >= 800) cup = "G"; else if (ml >= 650) cup = "F"; else if (ml >= 550) cup = "DD"; else if (ml >= 450) cup = "D"; else if (ml >= 350) cup = "C"; else if (ml >= 250) cup = "B"; else if (ml >= 150) cup = "A";
    breastCup.innerText = cup;
  });

  const colorMap: Record<string, string> = { 'blonde': '#e8c872', 'blond': '#e8c872', 'brunette': '#5c4033', 'brown': '#5c4033', 'black': '#333333', 'red': '#cc3333', 'ginger': '#d95a2b', 'blue': '#3366cc', 'green': '#339966', 'hazel': '#8e7618', 'purple': '#800080', 'pink': '#ff99cc', 'white': '#ffffff', 'gray': '#808080', 'grey': '#808080', 'pale': '#ffe4e1', 'tan': '#d2b48c' };
  function applyColorEffect(inputId: string) {
    const el = document.getElementById(inputId); if(!el) return;
    el.addEventListener('input', (e) => {
      const val = (e.target as HTMLInputElement).value.toLowerCase(); let foundColor = '';
      for (const key in colorMap) { if (val.includes(key)) { foundColor = colorMap[key]; break; } }
      if (foundColor) { el.style.borderLeft = '4px solid ' + foundColor; el.style.paddingLeft = '8px'; } 
      else { el.style.borderLeft = '1px solid #444'; el.style.paddingLeft = '6px'; }
    });
  }
  applyColorEffect('bt-hair'); applyColorEffect('bt-eyes'); applyColorEffect('bt-skin');

  const genderInput = document.getElementById('bt-gender') as HTMLInputElement;
  const genderIcon = document.getElementById('bt-gender-icon');
  if (genderInput && genderIcon) {
    genderInput.addEventListener('input', () => {
      const val = genderInput.value.toLowerCase().trim(); let icon = ''; let color = '#fff';
      if (val === 'female' || val === 'woman' || val === 'girl' || val === 'f') { icon = '♀️'; color = '#ff99cc'; } 
      else if (val === 'male' || val === 'man' || val === 'boy' || val === 'm') { icon = '♂️'; color = '#66b2ff'; } 
      else if (val.includes('trans') || val.includes('non-binary') || val === 'nb' || val === 't') { icon = '⚧️'; color = '#e0e0e0'; } 
      else if (val.includes('futa') || val.includes('herm') || val.includes('intersex') || val === 'h' || val === 'i') { icon = '⚥'; color = '#cc99ff'; }
      genderIcon.innerText = icon; genderIcon.style.color = color;
    });
  }

  // ─── Listen for sheet updates from the backend ─────────────
  ctx.onBackendMessage((msg: any) => {
    if (msg.type === 'SHEET_UPDATED' && msg.xml) {
      populateFormFromXml(msg.xml);
    }
  });

  // Helper to extract <sheet_update> XML from a text string
  function extractSheetUpdateFromText(text: string): string | null {
    if (!text) return null;
    const match = text.match(/<sheet_update>\s*([\s\S]*?)\s*<\/sheet_update>/i);
    return match ? match[1].trim() : null;
  }

  // ─── Live Preview on Swipe ─────────────────────────────────
  // When the user browses swipes, instantly update the UI to show
  // the sheet state from whichever swipe they are looking at.
  ctx.events.on('MESSAGE_SWIPED', (payload: any) => {
    if (payload.action === 'navigated' || payload.action === 'added') {
      const msg = payload.message;
      const swipeId = payload.swipeId;
      
      if (msg && msg.swipes && msg.swipes[swipeId] !== undefined) {
        const swipeText = msg.swipes[swipeId];
        const updateXml = extractSheetUpdateFromText(swipeText);
        if (updateXml) {
          populateFormFromXml(updateXml);
        }
      }
    }
  });

  // ─── Live Preview on Generation End ────────────────────────
  // When the LLM finishes a response, instantly update the UI to
  // show the pending sheet from that response.
  ctx.events.on('MESSAGE_SENT', (payload: any) => {
    const msg = payload.message;
    if (msg && msg.swipes && msg.swipe_id !== undefined) {
      const swipeText = msg.swipes[msg.swipe_id];
      const updateXml = extractSheetUpdateFromText(swipeText);
      if (updateXml) {
        populateFormFromXml(updateXml);
      }
    }
  });

  function populateFormFromXml(xml: string) {
    document.querySelectorAll('.dyn-skill, .dyn-trait, .dyn-inv, #stomach-container .vital-slot, #bowel-container .vital-slot').forEach(el => el.remove());
    if (!xml || xml.trim() === '') return;

    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    const getText = (tag: string) => doc.querySelector(tag)?.textContent || '';
    const getAttr = (el: Element | null, attr: string) => el?.getAttribute(attr) || '';

    const state = doc.querySelector('State');
    if (state) {
      document.querySelectorAll('.bt-scrape').forEach(el => {
        const input = el as HTMLInputElement;
        const id = input.getAttribute('data-id');
        if (id && ['Health', 'Energy', 'Time', 'Weather', 'Temperature', 'Area', 'Building', 'Room'].includes(id)) {
          const node = state.querySelector(id);
          if (node) input.value = node.textContent || '';
        }
      });
    }

    const baseStats = doc.querySelector('BaseStats');
    if (baseStats) {
      document.querySelectorAll('.bt-scrape').forEach(el => {
        const input = el as HTMLInputElement;
        const id = input.getAttribute('data-id');
        if (id && !['Health', 'Energy', 'Time', 'Weather', 'Temperature', 'Area', 'Building', 'Room'].includes(id)) {
          const node = baseStats.querySelector(id);
          if (node) input.value = node.textContent || '';
        }
      });
    }

    document.getElementById('bt-height')?.dispatchEvent(new Event('input'));
    document.getElementById('bt-weight')?.dispatchEvent(new Event('input'));
    document.getElementById('bt-breast-ml')?.dispatchEvent(new Event('input'));
    document.getElementById('bt-gender')?.dispatchEvent(new Event('input'));
    document.getElementById('bt-hair')?.dispatchEvent(new Event('input'));
    document.getElementById('bt-eyes')?.dispatchEvent(new Event('input'));
    document.getElementById('bt-skin')?.dispatchEvent(new Event('input'));

    doc.querySelectorAll('Equip').forEach(equipNode => {
      const slot = equipNode.getAttribute('slot');
      const elasticity = equipNode.getAttribute('elasticity') || 'standard';
      const value = equipNode.textContent || '';
      const input = document.querySelector(`.bt-cloth-slot[data-slot="${slot}"]`) as HTMLInputElement;
      if (input) {
        input.value = value;
        const flexSelect = input.previousElementSibling?.querySelector('.bt-cloth-flex') as HTMLSelectElement;
        if (flexSelect) flexSelect.value = elasticity;
      }
    });

    doc.querySelectorAll('Backpack > Item').forEach(itemNode => {
      const qty = itemNode.getAttribute('qty') || '1';
      const name = itemNode.textContent || '';
      document.getElementById('add-inv-btn')?.click();
      const invContainer = document.getElementById('inv-container');
      if (invContainer) {
        const lastItem = invContainer.lastElementChild as HTMLElement;
        if (lastItem) {
          (lastItem.querySelector('.d-qty') as HTMLInputElement).value = qty;
          (lastItem.querySelector('.d-name') as HTMLInputElement).value = name;
        }
      }
    });

    doc.querySelectorAll('Skill').forEach(skillNode => {
      document.getElementById('add-skill-btn')?.click();
      const skillsContainer = document.getElementById('skills-container');
      if (skillsContainer) {
        const lastSkill = skillsContainer.lastElementChild as HTMLElement;
        if (lastSkill) {
          (lastSkill.querySelector('.d-name') as HTMLInputElement).value = skillNode.getAttribute('name') || '';
          (lastSkill.querySelector('.d-lvl') as HTMLInputElement).value = skillNode.getAttribute('level') || '1';
          (lastSkill.querySelector('.d-desc') as HTMLTextAreaElement).value = skillNode.textContent || '';
        }
      }
    });

    doc.querySelectorAll('Trait').forEach(traitNode => {
      document.getElementById('add-trait-btn')?.click();
      const traitsContainer = document.getElementById('traits-container');
      if (traitsContainer) {
        const lastTrait = traitsContainer.lastElementChild as HTMLElement;
        if (lastTrait) {
          (lastTrait.querySelector('.d-name') as HTMLInputElement).value = traitNode.getAttribute('name') || '';
          (lastTrait.querySelector('.d-desc') as HTMLTextAreaElement).value = traitNode.textContent || '';
        }
      }
    });

    doc.querySelectorAll('Stomach > Item').forEach(itemNode => {
      document.getElementById('add-stomach-btn')?.click();
      const stomachContainer = document.getElementById('stomach-container');
      if (stomachContainer) {
        const lastItem = stomachContainer.lastElementChild as HTMLElement;
        if (lastItem) {
          (lastItem.querySelector('.v-name') as HTMLInputElement).value = getAttr(itemNode, 'name');
          (lastItem.querySelector('.v-vol') as HTMLInputElement).value = getAttr(itemNode, 'volume_L');
          (lastItem.querySelector('.v-dig') as HTMLInputElement).value = (getAttr(itemNode, 'digestion') || '').replace('%', '');
          
          const type = getAttr(itemNode, 'type') || 'Food';
          const typeSelect = lastItem.querySelector('.v-type') as HTMLSelectElement;
          typeSelect.value = type;
          typeSelect.dispatchEvent(new Event('change'));
          
          const descNode = itemNode.querySelector('Description');
          (lastItem.querySelector('.v-flavor') as HTMLTextAreaElement).value = descNode?.textContent || '';
          
          if (type === 'Prey') {
            const gearNode = itemNode.querySelector('BoundGear');
            (lastItem.querySelector('.v-gear') as HTMLTextAreaElement).value = gearNode?.textContent || '';
          }
          
          const digInput = lastItem.querySelector('.item-dig-input') as HTMLInputElement;
          if (digInput) digInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    });

    doc.querySelectorAll('Remains').forEach(remainsNode => {
      document.getElementById('add-remains-btn')?.click();
      const bowelContainer = document.getElementById('bowel-container');
      if (bowelContainer) {
        const lastRemains = bowelContainer.lastElementChild as HTMLElement;
        if (lastRemains) {
          (lastRemains.querySelector('.v-name') as HTMLInputElement).value = remainsNode.textContent || '';
          (lastRemains.querySelector('.v-vol') as HTMLInputElement).value = getAttr(remainsNode, 'volume_L');
        }
      }
    });

    document.getElementById('bt-cap-mult')?.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
