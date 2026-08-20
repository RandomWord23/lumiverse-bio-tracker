import type { SpindleFrontendContext } from 'lumiverse-spindle-types';

export function setup(ctx: SpindleFrontendContext) {
  
  // 1. Inject the CSS (Fixed for mobile scrolling and added Tab styles)
  const style = document.createElement('style');
  style.innerHTML = `
    #bio-tracker-panel {
      position: fixed; top: 0; right: -400px; width: 350px; max-width: 100vw; height: 100%;
      background: #1a1a1a; color: #e0e0e0; z-index: 10000; transition: right 0.3s ease-in-out;
      box-shadow: -5px 0 20px rgba(0,0,0,0.6); display: flex; flex-direction: column;
      font-family: system-ui, -apple-system, sans-serif; border-left: 1px solid #333;
    }
    #bio-tracker-panel.open { right: 0; }
    
    .bt-header { background: #2a2a2a; padding: 15px 20px; font-size: 18px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #ff4444; }
    .bt-close { cursor: pointer; color: #ff4444; font-size: 20px; padding: 5px; }
    
    /* Main Content Area - allows scrolling without cutting off */
    .bt-content { flex: 1; overflow-y: auto; padding: 15px; padding-bottom: 80px; }
    
    /* Tab Navigation */
    .bt-tabs { display: flex; background: #111; border-bottom: 1px solid #333; }
    .bt-tab-btn { flex: 1; padding: 12px 0; background: transparent; color: #888; border: none; font-weight: bold; cursor: pointer; text-align: center; font-size: 13px; }
    .bt-tab-btn.active { color: #ff4444; border-bottom: 2px solid #ff4444; background: #222; }
    .bt-tab-content { display: none; }
    .bt-tab-content.active { display: block; }
    
    /* Sub-Tabs */
    .bt-sub-tabs { display: flex; margin-bottom: 15px; border-radius: 6px; overflow: hidden; border: 1px solid #333; }
    .bt-sub-btn { flex: 1; padding: 8px 0; background: #222; color: #aaa; border: none; font-size: 12px; cursor: pointer; }
    .bt-sub-btn.active { background: #444; color: #fff; }
    .bt-sub-content { display: none; }
    .bt-sub-content.active { display: block; }
    
    /* Form Elements */
    .bt-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 14px; }
    .bt-input, .bt-textarea { background: #111; border: 1px solid #444; color: #fff; border-radius: 4px; padding: 6px; }
    .bt-input { width: 90px; text-align: right; }
    .bt-input.full { width: 100%; text-align: left; margin-bottom: 10px; }
    .bt-textarea { width: 100%; box-sizing: border-box; resize: vertical; margin-bottom: 10px; }
    .bt-value { font-weight: bold; color: #ff4444; }
    
    /* Dynamic Skills & Traits */
    .bt-add-btn { background: #2a2a2a; color: #4CAF50; border: 1px solid #333; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-weight: bold; float: right; }
    .bt-dynamic-item { background: #222; border: 1px dashed #444; padding: 10px; border-radius: 6px; margin-bottom: 10px; position: relative; }
    .bt-remove-btn { position: absolute; top: 10px; right: 10px; background: transparent; border: none; color: #ff4444; cursor: pointer; font-size: 16px; }
    
    .bt-action-btn { width: 100%; padding: 12px; background: #333; color: white; border: 1px solid #444; border-radius: 4px; cursor: pointer; margin-bottom: 10px; font-weight: bold; }
    .bt-action-btn:hover { background: #444; }
    .bt-action-btn.danger { background: #5a2020; border-color: #ff4444; }
  `;
  document.head.appendChild(style);

  // 2. Build the HTML structure
  const panel = document.createElement('div');
  panel.id = 'bio-tracker-panel';
  panel.innerHTML = `
    <div class="bt-header">
      <span>🧬 Master Control</span>
      <span class="bt-close" id="bt-close-btn">✖</span>
    </div>
    
    <!-- Main Tabs -->
    <div class="bt-tabs">
      <button class="bt-tab-btn active" data-tab="tab-char">Character</button>
      <button class="bt-tab-btn" data-tab="tab-inv">Inventory</button>
      <button class="bt-tab-btn" data-tab="tab-vitals">Vitals</button>
    </div>

    <div class="bt-content">
      
      <!-- TAB: CHARACTER -->
      <div id="tab-char" class="bt-tab-content active">
        <div class="bt-sub-tabs">
          <button class="bt-sub-btn active" data-sub="sub-app">Appearance</button>
          <button class="bt-sub-btn" data-sub="sub-skills">Skills & Traits</button>
        </div>
        
        <!-- Appearance Sub-Tab -->
        <div id="sub-app" class="bt-sub-content active">
          <input type="text" class="bt-input full" placeholder="Name" id="bt-name">
          <div class="bt-row"><span>Gender:</span> <input type="text" class="bt-input" id="bt-gender"></div>
          <div class="bt-row"><span>Pronouns:</span> <input type="text" class="bt-input" id="bt-pronouns"></div>
          <div class="bt-row"><span>Skin Tone:</span> <input type="text" class="bt-input" id="bt-skin"></div>
          <hr style="border-color: #333; margin: 15px 0;">
          <div class="bt-row"><span>Height (cm):</span> <input type="number" class="bt-input" id="bt-height" value="160"></div>
          <div class="bt-row"><span>Weight (kg):</span> <input type="number" class="bt-input" id="bt-weight" value="60"></div>
          <div style="font-size: 12px; color: #888; margin-bottom: 5px;">Body Measurements:</div>
          <textarea class="bt-textarea" rows="2" placeholder="e.g. Shoulders, Chest, Waist..." id="bt-meas"></textarea>
        </div>

        <!-- Skills & Traits Sub-Tab -->
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

      <!-- TAB: INVENTORY -->
      <div id="tab-inv" class="bt-tab-content">
        <div class="bt-row"><span>Wallet / Cash:</span> <input type="number" class="bt-input" id="bt-cash" value="0"></div>
        <hr style="border-color: #333; margin: 15px 0;">
        <div style="font-size: 13px; margin-bottom: 5px;">Worn Clothing & Constraints:</div>
        <textarea class="bt-textarea" rows="3" id="bt-cloth" placeholder="Describe clothes and how tight they are..."></textarea>
        <div style="font-size: 13px; margin-bottom: 5px;">Backpack / Pockets:</div>
        <textarea class="bt-textarea" rows="5" id="bt-pocket" placeholder="List items here..."></textarea>
      </div>

      <!-- TAB: VITALS (Metabolism) -->
      <div id="tab-vitals" class="bt-tab-content">
        <div class="bt-row"><span>Health / HP:</span> <input type="text" class="bt-input" id="bt-health" value="100/100"></div>
        <hr style="border-color: #333; margin: 15px 0;">
        <div class="bt-row"><span>Stomach (ml):</span> <input type="number" class="bt-input" id="bt-stom" value="0"></div>
        <div class="bt-row"><span>Capacity:</span> <span class="bt-value">115.20 L</span></div>
        <div class="bt-row"><span>Belly Status:</span> <span class="bt-value" style="color:#aaa;">Flat (0-5%)</span></div>
        <div class="bt-row"><span>Mobility:</span> <span class="bt-value" style="color:#aaa;">Normal</span></div>
        <hr style="border-color: #333; margin: 15px 0;">
        <button class="bt-action-btn" id="bt-sync-btn">💾 Sync Changes to AI</button>
        <button class="bt-action-btn danger" id="bt-empty-btn">🚽 Force Empty Stomach</button>
      </div>

    </div>
  `;
  document.body.appendChild(panel);

  // 3. Floating Button Logic
  const floatingBtn = document.createElement('div');
  floatingBtn.innerText = '🧬 BIO';
  Object.assign(floatingBtn.style, {
    position: 'fixed', bottom: '80px', right: '20px', backgroundColor: '#ff4444', color: '#fff',
    padding: '12px 18px', borderRadius: '30px', fontWeight: 'bold', cursor: 'pointer', zIndex: '9999'
  });

  floatingBtn.addEventListener('click', () => { panel.classList.add('open'); floatingBtn.style.display = 'none'; });
  document.getElementById('bt-close-btn')?.addEventListener('click', () => { panel.classList.remove('open'); floatingBtn.style.display = 'block'; });
  document.body.appendChild(floatingBtn);

  // 4. Tab Switching Logic
  panel.querySelectorAll('.bt-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      panel.querySelectorAll('.bt-tab-btn').forEach(b => b.classList.remove('active'));
      panel.querySelectorAll('.bt-tab-content').forEach(c => c.classList.remove('active'));
      const target = (e.target as HTMLElement);
      target.classList.add('active');
      document.getElementById(target.dataset.tab!)?.classList.add('active');
    });
  });

  panel.querySelectorAll('.bt-sub-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      panel.querySelectorAll('.bt-sub-btn').forEach(b => b.classList.remove('active'));
      panel.querySelectorAll('.bt-sub-content').forEach(c => c.classList.remove('active'));
      const target = (e.target as HTMLElement);
      target.classList.add('active');
      document.getElementById(target.dataset.sub!)?.classList.add('active');
    });
  });

  // 5. Dynamic "+" Button Logic (Skills & Traits)
  document.getElementById('add-skill-btn')?.addEventListener('click', () => {
    const div = document.createElement('div');
    div.className = 'bt-dynamic-item';
    div.innerHTML = `
      <button class="bt-remove-btn" onclick="this.parentElement.remove()">✖</button>
      <input type="text" class="bt-input full" style="width: 60%;" placeholder="Skill Name">
      <input type="number" class="bt-input" style="width: 30%; position:absolute; top:10px; right: 40px;" placeholder="Lvl">
      <textarea class="bt-textarea" rows="2" placeholder="Description..."></textarea>
    `;
    document.getElementById('skills-container')?.appendChild(div);
  });

  document.getElementById('add-trait-btn')?.addEventListener('click', () => {
    const div = document.createElement('div');
    div.className = 'bt-dynamic-item';
    div.innerHTML = `
      <button class="bt-remove-btn" onclick="this.parentElement.remove()">✖</button>
      <input type="text" class="bt-input full" style="width: 80%;" placeholder="Trait Name">
      <textarea class="bt-textarea" rows="2" placeholder="Description..."></textarea>
    `;
    document.getElementById('traits-container')?.appendChild(div);
  });
}
