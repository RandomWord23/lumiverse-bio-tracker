import type { SpindleFrontendContext } from 'lumiverse-spindle-types';

export function setup(ctx: SpindleFrontendContext) {
  
  // 1. Inject the CSS
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
    .bt-input, .bt-textarea { background: #111; border: 1px solid #444; color: #fff; border-radius: 4px; padding: 6px; }
    .bt-input { width: 90px; text-align: right; }
    .bt-input-wide { width: 65%; text-align: left; } /* New class for long descriptions */
    .bt-input.full { width: 100%; text-align: left; margin-bottom: 10px; box-sizing: border-box; }
    .bt-textarea { width: 100%; box-sizing: border-box; resize: vertical; margin-bottom: 10px; }
    .bt-value { font-weight: bold; color: #ff4444; }
    .bt-section-title { font-size: 12px; color: #ff4444; margin: 15px 0 8px; border-bottom: 1px solid #333; padding-bottom: 3px; font-weight: bold; letter-spacing: 1px; }
    
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
          
          <div class="bt-section-title" style="margin-top: 0;">IDENTITY & BASE</div>
          <input type="text" class="bt-input full" placeholder="Character Name" id="bt-name">
          <div class="bt-row"><span>Species:</span> <input type="text" class="bt-input bt-input-wide" id="bt-species"></div>
          <div class="bt-row"><span>Age:</span> <input type="text" class="bt-input bt-input-wide" id="bt-age"></div>
          <div class="bt-row"><span>Gender:</span> <input type="text" class="bt-input bt-input-wide" id="bt-gender"></div>
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
          <div class="bt-row"><span>Build:</span> <input type="text" class="bt-input bt-input-wide" id="bt-build"></div>
          <div class="bt-row"><span>Height (cm):</span> <input type="number" class="bt-input" id="bt-height" value="160"></div>
          <div class="bt-row"><span>Weight (kg):</span> <input type="number" class="bt-input" id="bt-weight" value="60"></div>
          <div class="bt-row"><span>Breasts:</span> <input type="text" class="bt-input bt-input-wide" id="bt-breasts"></div>
          <div class="bt-row"><span>Ass:</span> <input type="text" class="bt-input bt-input-wide" id="bt-ass"></div>
          <div class="bt-row"><span>Penis:</span> <input type="text" class="bt-input bt-input-wide" id="bt-penis"></div>
          <div class="bt-row"><span>Vagina:</span> <input type="text" class="bt-input bt-input-wide" id="bt-vagina"></div>
          <textarea class="bt-textarea" rows="2" placeholder="Scars, Tattoos, Piercings..." id="bt-scars"></textarea>

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
        <div class="bt-section-title">CLOTHING & CONSTRAINTS</div>
        <textarea class="bt-textarea" rows="3" id="bt-cloth" placeholder="Describe clothes and how tight they are..."></textarea>
        <div class="bt-section-title">BACKPACK / POCKETS</div>
        <textarea class="bt-textarea" rows="5" id="bt-pocket" placeholder="List items here..."></textarea>
      </div>

      <!-- TAB: VITALS -->
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

  // 3. Floating Button with Draggable Logic
  const floatingBtn = document.createElement('div');
  floatingBtn.innerText = '🧬 BIO';
  Object.assign(floatingBtn.style, {
    position: 'fixed', bottom: '80px', right: '20px', backgroundColor: '#ff4444', color: '#fff',
    padding: '12px 18px', borderRadius: '30px', fontWeight: 'bold', cursor: 'pointer', zIndex: '9999',
    userSelect: 'none', transition: 'opacity 0.3s ease', opacity: '0.4'
  });
  document.body.appendChild(floatingBtn);

  // Auto-fade out when not in use
  let fadeTimeout: any;
  const resetFade = () => {
    floatingBtn.style.opacity = '1';
    clearTimeout(fadeTimeout);
    fadeTimeout = setTimeout(() => { floatingBtn.style.opacity = '0.4'; }, 3000);
  };
  resetFade(); // Init

  // Dragging variables
  let isDragging = false;
  let hasMoved = false;
  let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;

  // Touch logic for mobile (Blackview BV8800)
  floatingBtn.addEventListener('touchstart', (e) => {
    isDragging = true; hasMoved = false; resetFade();
    const touch = e.touches[0];
    const rect = floatingBtn.getBoundingClientRect();
    startX = touch.clientX; startY = touch.clientY;
    initialLeft = rect.left; initialTop = rect.top;
    
    // Switch to absolute positioning for dragging
    floatingBtn.style.bottom = 'auto'; floatingBtn.style.right = 'auto';
    floatingBtn.style.left = initialLeft + 'px'; floatingBtn.style.top = initialTop + 'px';
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasMoved = true; // threshold to prevent accidental drags
    floatingBtn.style.left = (initialLeft + dx) + 'px';
    floatingBtn.style.top = (initialTop + dy) + 'px';
  }, { passive: true });

  document.addEventListener('touchend', () => { isDragging = false; resetFade(); });

  // Open menu on tap (only if not dragged)
  floatingBtn.addEventListener('click', () => {
    if (!hasMoved) { panel.classList.add('open'); floatingBtn.style.display = 'none'; }
  });
  
  document.getElementById('bt-close-btn')?.addEventListener('click', () => { 
    panel.classList.remove('open'); floatingBtn.style.display = 'block'; resetFade();
  });

  // Attempt to hide on non-chat pages
  setInterval(() => {
    if (!panel.classList.contains('open')) {
      // If URL doesn't look like a chat page, hide the button (Lumiverse check)
      const isChat = window.location.href.includes('chat') || document.querySelector('.chat-messages, [data-chat-id]');
      floatingBtn.style.display = isChat ? 'block' : 'none';
    }
  }, 2000);

  // 4. Tab Switching & Dynamic Buttons (same as before)
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
