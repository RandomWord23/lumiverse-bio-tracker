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
    .bt-add-btn { background: #2a2a2a; color: #4CAF50; border: 1px solid #333; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-weight: bold; float: right; }
    .bt-dynamic-item { background: #222; border: 1px dashed #444; padding: 10px; border-radius: 6px; margin-bottom: 10px; position: relative; }
    .bt-remove-btn { position: absolute; top: 10px; right: 10px; background: transparent; border: none; color: #ff4444; cursor: pointer; font-size: 16px; }
    .bt-action-btn { width: 100%; padding: 12px; background: #333; color: white; border: 1px solid #444; border-radius: 4px; cursor: pointer; margin-bottom: 10px; font-weight: bold; }
    
    /* Small label for inventory slots */
    .slot-label { font-size: 11px; color: #888; text-transform: uppercase; margin-bottom: 2px; display: block; }
    .flex-row { display: flex; justify-content: space-between; align-items: center; }
  `;
  document.head.appendChild(style);

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
      <button class="bt-tab-btn" data-tab="tab-vitals">Vitals</button>
    </div>

    <div class="bt-content">
      <!-- CHARACTER TAB -->
      <div id="tab-char" class="bt-tab-content active">
        <div class="bt-sub-tabs">
          <button class="bt-sub-btn active" data-sub="sub-app">Appearance</button>
          <button class="bt-sub-btn" data-sub="sub-skills">Skills & Traits</button>
        </div>
        
        <div id="sub-app" class="bt-sub-content active">
          <div class="bt-section-title" style="margin-top: 0;">IDENTITY & BASE</div>
          <input type="text" class="bt-input full" placeholder="Character Name" id="bt-name">
          <div class="bt-row"><span>Species:</span> <input type="text" class="bt-input bt-input-wide" id="bt-species"></div>
          <div class="bt-row"><span>Age:</span> <input type="text" class="bt-input bt-input-wide" id="bt-age"></div>
          
          <div class="bt-row">
            <span>Gender:</span> 
            <div style="display:flex; align-items:center; width: 65%;">
              <input type="text" class="bt-input" style="flex:1;" id="bt-gender">
              <span id="bt-gender-icon" style="width: 25px; text-align: right; font-size: 16px;"></span>
            </div>
          </div>
          
          <div class="bt-row"><span>Pronouns:</span> <input type="text" class="bt-input bt-input-wide" id="bt-pronouns"></div>
          <div class="bt-row"><span>Voice:</span> <input type="text" class="bt-input bt-input-wide" id="bt-voice"></div>
          <div class="bt-row"><span>Scent:</span> <input type="text" class="bt-input bt-input-wide" id="bt-scent"></div>

          <div class="bt-section-title">HEAD & FACE</div>
          <div class="bt-row"><span>Hair:</span> <input type="text" class="bt-input bt-input-wide" id="bt-hair"></div>
          <div class="bt-row"><span>Eyes:</span> <input type="text" class="bt-input bt-input-wide" id="bt-eyes"></div>
          <div class="bt-row"><span>Mouth:</span> <input type="text" class="bt-input bt-input-wide" id="bt-mouth"></div>
          <div class="bt-row"><span>Skin:</span> <input type="text" class="bt-input bt-input-wide" id="bt-skin"></div>
          <div class="bt-row"><span>Makeup:</span> <input type="text" class="bt-input bt-input-wide" id="bt-makeup"></div>
          <textarea class="bt-textarea" rows="2" placeholder="Distinct facial features..." id="bt-features"></textarea>

          <div class="bt-section-title">BODY & ANATOMY</div>
          <div class="bt-row"><span>Build:</span> <input type="text" class="bt-input bt-input-wide" placeholder="e.g. athletic, slender" id="bt-build"></div>
          <div class="bt-row"><span>Height (cm):</span> <input type="number" class="bt-input" id="bt-height" value="160"></div>
          <div class="bt-row"><span>Weight (kg):</span> <input type="number" class="bt-input" id="bt-weight" value="60"></div>
          
          <div class="bt-row">
            <span>Breasts (ml):</span> 
            <div style="display:flex; align-items:center; width: 65%;">
              <input type="number" class="bt-input" style="flex:1;" id="bt-breast-ml" value="0">
              <span id="bt-breast-cup" style="width: 45px; text-align:right; font-weight:bold; color:#ff4444;">AA</span>
            </div>
          </div>
          <input type="text" class="bt-input full" placeholder="Breast descriptor (e.g., firm, perky)" id="bt-breast-desc">

          <div class="bt-row"><span>Ass (Hips cm):</span> <input type="number" class="bt-input bt-input-wide" id="bt-ass-cm" value="90"></div>
          <input type="text" class="bt-input full" placeholder="Ass descriptor (e.g., plump, wide)" id="bt-ass-desc">

          <div class="bt-row">
            <span>Penis (L/G cm):</span> 
            <div style="display:flex; justify-content:space-between; width: 65%;">
              <input type="number" class="bt-input bt-input-small" placeholder="Len" id="bt-penis-len">
              <span style="color:#666; margin-top:5px;">x</span>
              <input type="number" class="bt-input bt-input-small" placeholder="Girth" id="bt-penis-girth">
            </div>
          </div>
          <input type="text" class="bt-input full" placeholder="Penis descriptor (e.g., uncut, veiny)" id="bt-penis-desc">
          
          <div class="bt-row"><span>Vagina:</span> <input type="text" class="bt-input bt-input-wide" placeholder="Descriptor..." id="bt-vagina"></div>
          
          <div style="font-size: 13px; margin-top: 15px; margin-bottom: 5px; color: #888;">Markings & Scars:</div>
          <textarea class="bt-textarea" rows="2" placeholder="Scars, Tattoos, Piercings..." id="bt-scars"></textarea>
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

      <!-- NEW INVENTORY TAB -->
      <div id="tab-inv" class="bt-tab-content">
        
        <!-- Wealth System -->
        <div class="bt-row">
          <span style="font-weight:bold; color:#ff4444;">WEALTH</span>
          <select id="bt-currency-type" class="bt-select" style="width: 100px;">
            <option value="modern">Modern ($)</option>
            <option value="fantasy">Fantasy (G/S/C)</option>
          </select>
        </div>
        
        <div id="currency-modern">
          <input type="number" class="bt-input full" id="bt-cash-modern" placeholder="Balance (e.g. 1500)">
        </div>
        
        <div id="currency-fantasy" style="display:none; justify-content:space-between; gap:5px; margin-bottom:10px;">
          <div style="flex:1; display:flex; align-items:center;"><input type="number" class="bt-input" style="width:100%;" placeholder="0"><span style="margin-left:5px; color:#ffd700; font-weight:bold;">G</span></div>
          <div style="flex:1; display:flex; align-items:center;"><input type="number" class="bt-input" style="width:100%;" placeholder="0"><span style="margin-left:5px; color:#c0c0c0; font-weight:bold;">S</span></div>
          <div style="flex:1; display:flex; align-items:center;"><input type="number" class="bt-input" style="width:100%;" placeholder="0"><span style="margin-left:5px; color:#cd7f32; font-weight:bold;">C</span></div>
        </div>

        <hr style="border-color: #333; margin: 15px 0;">
        
        <!-- Clothing System -->
        <div class="bt-section-title" style="display:flex; justify-content:space-between; align-items:center;">
          CLOTHING SLOTS
          <select class="bt-select" id="bt-cloth-mode" style="width:110px; border-color:#ff4444;">
            <option value="flavor">Mode: Flavor</option>
            <option value="hardcore">Mode: Hardcore</option>
          </select>
        </div>

        <!-- Head & Neck (No Elasticity needed) -->
        <span class="slot-label">Head (Top)</span><input type="text" class="bt-input full" placeholder="Hats, Helmets, Hoods">
        <span class="slot-label">Head (Face)</span><input type="text" class="bt-input full" placeholder="Glasses, Goggles, Visors">
        <span class="slot-label">Head (Lower)</span><input type="text" class="bt-input full" placeholder="Masks, Bandanas">
        <span class="slot-label">Neck</span><input type="text" class="bt-input full" placeholder="Scarves, Gorgets, Chokers">

        <!-- Underwear (Needs Elasticity) -->
        <div class="flex-row"><span class="slot-label">Underwear (Top)</span><select class="bt-select"><option value="rigid">Rigid</option><option value="standard">Standard</option><option value="stretchy" selected>Stretchy</option><option value="magic">Magic</option></select></div>
        <input type="text" class="bt-input full" placeholder="Bra, Binder, Undershirt">
        <div class="flex-row"><span class="slot-label">Underwear (Bottom)</span><select class="bt-select"><option value="rigid">Rigid</option><option value="standard">Standard</option><option value="stretchy" selected>Stretchy</option><option value="magic">Magic</option></select></div>
        <input type="text" class="bt-input full" placeholder="Panties, Boxers, Loincloth">

        <!-- Torso Layers (Needs Elasticity) -->
        <div class="flex-row"><span class="slot-label">Torso (Layer 1 - Base)</span><select class="bt-select"><option value="rigid">Rigid</option><option value="standard" selected>Standard</option><option value="stretchy">Stretchy</option><option value="magic">Magic</option></select></div>
        <input type="text" class="bt-input full" placeholder="T-shirt, Blouse, Gambeson">
        <div class="flex-row"><span class="slot-label">Torso (Layer 2 - Mid)</span><select class="bt-select"><option value="rigid">Rigid</option><option value="standard" selected>Standard</option><option value="stretchy">Stretchy</option><option value="magic">Magic</option></select></div>
        <input type="text" class="bt-input full" placeholder="Sweater, Vest, Chainmail">
        <div class="flex-row"><span class="slot-label">Torso (Layer 3 - Outer)</span><select class="bt-select"><option value="rigid">Rigid</option><option value="standard" selected>Standard</option><option value="stretchy">Stretchy</option><option value="magic">Magic</option></select></div>
        <input type="text" class="bt-input full" placeholder="Jacket, Coat, Cuirass">
        <div class="flex-row"><span class="slot-label">Torso (Layer 4 - Shell)</span><select class="bt-select"><option value="rigid" selected>Rigid</option><option value="standard">Standard</option><option value="stretchy">Stretchy</option><option value="magic">Magic</option></select></div>
        <input type="text" class="bt-input full" placeholder="Overcoat, Poncho, Power Armor">

        <!-- Hands (No Elasticity) -->
        <span class="slot-label">Hands (Layer 1)</span><input type="text" class="bt-input full" placeholder="Inner Gloves, Wraps">
        <span class="slot-label">Hands (Layer 2)</span><input type="text" class="bt-input full" placeholder="Gauntlets, Thick Gloves">

        <!-- Legs (Needs Elasticity) -->
        <div class="flex-row"><span class="slot-label">Legs (Layer 1 - Base)</span><select class="bt-select"><option value="rigid">Rigid</option><option value="standard" selected>Standard</option><option value="stretchy">Stretchy</option><option value="magic">Magic</option></select></div>
        <input type="text" class="bt-input full" placeholder="Jeans, Leggings, Trousers">
        <div class="flex-row"><span class="slot-label">Legs (Layer 2 - Outer)</span><select class="bt-select"><option value="rigid" selected>Rigid</option><option value="standard">Standard</option><option value="stretchy">Stretchy</option><option value="magic">Magic</option></select></div>
        <input type="text" class="bt-input full" placeholder="Greaves, Chaps, Snow Pants">

        <!-- Feet (No Elasticity) -->
        <span class="slot-label">Feet (Layer 1)</span><input type="text" class="bt-input full" placeholder="Socks, Stockings">
        <span class="slot-label">Feet (Layer 2)</span><input type="text" class="bt-input full" placeholder="Shoes, Boots, Sabatons">

        <!-- Accessories & Extras (Waist needs elasticity) -->
        <span class="slot-label">Jewelry</span><input type="text" class="bt-input full" placeholder="Rings, Amulets, Bracelets">
        <span class="slot-label">Back</span><input type="text" class="bt-input full" placeholder="Backpack, Cape, Quiver">
        <div class="flex-row"><span class="slot-label">Waist</span><select class="bt-select"><option value="rigid" selected>Rigid</option><option value="standard">Standard</option><option value="stretchy">Stretchy</option><option value="magic">Magic</option></select></div>
        <input type="text" class="bt-input full" placeholder="Belt, Holster, Scabbard">

        <hr style="border-color: #333; margin: 15px 0;">
        <div class="bt-section-title">BACKPACK / POCKETS</div>
        <textarea class="bt-textarea" rows="5" id="bt-pocket" placeholder="List loose items, weapons, or ground loot here..."></textarea>
      </div>

      <!-- VITALS TAB -->
      <div id="tab-vitals" class="bt-tab-content">
        <div class="bt-row"><span>Health / HP:</span> <input type="text" class="bt-input" id="bt-health" value="100/100"></div>
        <hr style="border-color: #333; margin: 15px 0;">
        <div class="bt-row"><span>Stomach (ml):</span> <input type="number" class="bt-input" id="bt-stom" value="0"></div>
        <div class="bt-row"><span>Capacity:</span> <span class="bt-value">115.20 L</span></div>
        <div class="bt-row"><span>Belly Status:</span> <span class="bt-value" style="color:#aaa;">Flat (0-5%)</span></div>
        <div class="bt-row"><span>Mobility:</span> <span class="bt-value" style="color:#aaa;">Normal</span></div>
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
    padding: '12px', borderRadius: '50%', fontSize: '24px', cursor: 'pointer', zIndex: '9999',
    userSelect: 'none', transition: 'opacity 0.3s ease', opacity: '0.4', border: '2px solid #555'
  });
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

  document.addEventListener('touchend', () => { isDragging = false; resetFade(); });

  floatingBtn.addEventListener('click', () => {
    if (!hasMoved) { panel.classList.add('open'); floatingBtn.style.display = 'none'; }
  });
  
  document.getElementById('bt-close-btn')?.addEventListener('click', () => { 
    panel.classList.remove('open'); floatingBtn.style.display = 'block'; resetFade();
  });

  // Tab Logic
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

  // Currency Toggle Logic
  const currencyType = document.getElementById('bt-currency-type') as HTMLSelectElement;
  const currencyModern = document.getElementById('currency-modern');
  const currencyFantasy = document.getElementById('currency-fantasy');

  if (currencyType && currencyModern && currencyFantasy) {
    currencyType.addEventListener('change', (e) => {
      if ((e.target as HTMLSelectElement).value === 'fantasy') {
        currencyModern.style.display = 'none';
        currencyFantasy.style.display = 'flex';
      } else {
        currencyModern.style.display = 'block';
        currencyFantasy.style.display = 'none';
      }
    });
  }

  // Breast ML logic
  const breastInput = document.getElementById('bt-breast-ml') as HTMLInputElement;
  const breastCup = document.getElementById('bt-breast-cup') as HTMLSpanElement;
  breastInput?.addEventListener('input', () => {
    const ml = parseInt(breastInput.value) || 0;
    let cup = "AA";
    if (ml >= 1000) cup = "H+";
    else if (ml >= 800) cup = "G";
    else if (ml >= 650) cup = "F";
    else if (ml >= 550) cup = "DD";
    else if (ml >= 450) cup = "D";
    else if (ml >= 350) cup = "C";
    else if (ml >= 250) cup = "B";
    else if (ml >= 150) cup = "A";
    breastCup.innerText = cup;
  });

  // Color Map Logic
  const colorMap: Record<string, string> = {
    'blonde': '#e8c872', 'blond': '#e8c872', 'brunette': '#5c4033', 'brown': '#5c4033',
    'black': '#333333', 'red': '#cc3333', 'ginger': '#d95a2b', 'blue': '#3366cc',
    'green': '#339966', 'hazel': '#8e7618', 'purple': '#800080', 'pink': '#ff99cc',
    'white': '#ffffff', 'gray': '#808080', 'grey': '#808080', 'pale': '#ffe4e1', 'tan': '#d2b48c'
  };
  function applyColorEffect(inputId: string) {
    const el = document.getElementById(inputId);
    if(!el) return;
    el.addEventListener('input', (e) => {
      const val = (e.target as HTMLInputElement).value.toLowerCase();
      let foundColor = '';
      for (const key in colorMap) { if (val.includes(key)) { foundColor = colorMap[key]; break; } }
      if (foundColor) { el.style.borderLeft = '4px solid ' + foundColor; el.style.paddingLeft = '8px'; } 
      else { el.style.borderLeft = '1px solid #444'; el.style.paddingLeft = '6px'; }
    });
  }
  applyColorEffect('bt-hair');
  applyColorEffect('bt-eyes');
  applyColorEffect('bt-skin');

  // Gender Icon Logic
  const genderInput = document.getElementById('bt-gender') as HTMLInputElement;
  const genderIcon = document.getElementById('bt-gender-icon');
  
  if (genderInput && genderIcon) {
    genderInput.addEventListener('input', () => {
      const val = genderInput.value.toLowerCase().trim();
      let icon = '';
      let color = '#fff';
      
      if (val === 'female' || val === 'woman' || val === 'girl' || val === 'f') {
        icon = '♀️'; color = '#ff99cc';
      } else if (val === 'male' || val === 'man' || val === 'boy' || val === 'm') {
        icon = '♂️'; color = '#66b2ff';
      } else if (val.includes('trans') || val.includes('non-binary') || val === 'nb' || val === 't') {
        icon = '⚧️'; color = '#e0e0e0';
      } else if (val.includes('futa') || val.includes('herm') || val.includes('intersex') || val === 'h' || val === 'i') {
        icon = '⚥'; color = '#cc99ff';
      }
      
      genderIcon.innerText = icon;
      genderIcon.style.color = color;
    });
  }

  // Dynamic Traits/Skills
  document.getElementById('add-skill-btn')?.addEventListener('click', () => {
    const div = document.createElement('div'); div.className = 'bt-dynamic-item';
    div.innerHTML = `<button class="bt-remove-btn" onclick="this.parentElement.remove()">✖</button><input type="text" class="bt-input full" style="width: 60%;" placeholder="Skill Name"><input type="number" class="bt-input" style="width: 30%; position:absolute; top:10px; right: 40px;" placeholder="Lvl"><textarea class="bt-textarea" rows="2" placeholder="Description..."></textarea>`;
    document.getElementById('skills-container')?.appendChild(div);
  });
  document.getElementById('add-trait-btn')?.addEventListener('click', () => {
    const div = document.createElement('div'); div.className = 'bt-dynamic-item';
    div.innerHTML = `<button class="bt-remove-btn" onclick="this.parentElement.remove()">✖</button><input type="text" class="bt-input full" style="width: 80%;" placeholder="Trait Name"><textarea class="bt-textarea" rows="2" placeholder="Description..."></textarea>`;
    document.getElementById('traits-container')?.appendChild(div);
  });
}
