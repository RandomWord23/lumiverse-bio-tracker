import type { SpindleFrontendContext } from 'lumiverse-spindle-types';

export function setup(ctx: SpindleFrontendContext) {
  
  // 1. Inject the CSS for our slide-out panel
  const style = document.createElement('style');
  style.innerHTML = `
    #bio-tracker-panel {
      position: fixed;
      top: 0;
      right: -400px; /* Hidden off-screen by default */
      width: 350px;
      height: 100vh;
      background: #1a1a1a;
      color: #e0e0e0;
      z-index: 10000;
      transition: right 0.3s ease-in-out;
      box-shadow: -5px 0 20px rgba(0,0,0,0.6);
      display: flex;
      flex-direction: column;
      font-family: system-ui, -apple-system, sans-serif;
      border-left: 1px solid #333;
    }
    #bio-tracker-panel.open {
      right: 0; /* Slide in */
    }
    .bt-header {
      background: #2a2a2a; padding: 15px 20px; font-size: 18px; font-weight: bold;
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 2px solid #ff4444;
    }
    .bt-close { cursor: pointer; color: #ff4444; font-size: 20px; }
    .bt-content { padding: 15px; overflow-y: auto; flex-grow: 1; }
    .bt-section { margin-bottom: 20px; background: #222; padding: 12px; border-radius: 8px; border: 1px solid #333; }
    .bt-section h3 { margin: 0 0 12px 0; font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #333; padding-bottom: 5px; }
    .bt-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 14px; }
    .bt-input { width: 70px; background: #111; border: 1px solid #444; color: #fff; padding: 4px 8px; border-radius: 4px; text-align: right; }
    .bt-textarea { width: 100%; box-sizing: border-box; background: #111; color: #fff; border: 1px solid #444; border-radius: 4px; padding: 8px; margin-top: 5px; resize: vertical; }
    .bt-value { font-weight: bold; color: #ff4444; }
    .bt-btn { width: 100%; padding: 10px; background: #333; color: white; border: 1px solid #444; border-radius: 4px; cursor: pointer; margin-bottom: 8px; font-weight: bold; transition: background 0.2s; }
    .bt-btn:hover { background: #444; }
    .bt-btn.danger { background: #5a2020; border-color: #ff4444; }
    .bt-btn.danger:hover { background: #7a2a2a; }
  `;
  document.head.appendChild(style);

  // 2. Build the HTML structure for the panel
  const panel = document.createElement('div');
  panel.id = 'bio-tracker-panel';
  panel.innerHTML = `
    <div class="bt-header">
      <span>🧬 Master Control</span>
      <span class="bt-close" id="bt-close-btn">✖</span>
    </div>
    <div class="bt-content">
      
      <!-- Vitals & Bio -->
      <div class="bt-section">
        <h3>Vitals & Bio</h3>
        <div class="bt-row"><span>Weight (kg):</span> <input class="bt-input" type="number" id="bt-weight" value="60"></div>
        <div class="bt-row"><span>Height (cm):</span> <input class="bt-input" type="number" id="bt-height" value="160"></div>
        <div class="bt-row"><span>Stomach (ml):</span> <input class="bt-input" type="number" id="bt-stom-cur" value="0"></div>
        <div class="bt-row"><span>Capacity:</span> <span class="bt-value">115.20 L</span></div>
        <div class="bt-row"><span>Belly Status:</span> <span class="bt-value" style="color:#aaa;">Flat (0-5%)</span></div>
        <div class="bt-row"><span>Mobility:</span> <span class="bt-value" style="color:#aaa;">Normal</span></div>
      </div>

      <!-- Inventory & Wallet -->
      <div class="bt-section">
        <h3>Inventory</h3>
        <div class="bt-row"><span>Cash:</span> <input class="bt-input" type="number" id="bt-cash" value="0"></div>
        <div style="font-size: 14px; margin-top: 10px;">Pocket / Bag Contents:</div>
        <textarea class="bt-textarea" rows="3" id="bt-inv">Empty</textarea>
      </div>

      <!-- Clothing -->
      <div class="bt-section">
        <h3>Clothing State</h3>
        <div style="font-size: 14px;">Current Outfit & Constraints:</div>
        <textarea class="bt-textarea" rows="2" id="bt-cloth">Standard civilian clothes. (Will tear if stretched past Twins size)</textarea>
      </div>

      <!-- Quick Actions -->
      <div class="bt-section">
        <h3>Quick Actions</h3>
        <button class="bt-btn" id="bt-save-btn">💾 Sync Changes to AI</button>
        <button class="bt-btn danger" id="bt-empty-btn">🚽 Force Empty Stomach</button>
      </div>

    </div>
  `;
  document.body.appendChild(panel);

  // 3. Create the floating button to open the panel
  const floatingBtn = document.createElement('div');
  floatingBtn.innerText = '🧬 BIO';
  Object.assign(floatingBtn.style, {
    position: 'fixed', bottom: '80px', right: '20px', backgroundColor: '#ff4444', color: '#fff',
    padding: '12px 18px', borderRadius: '30px', fontWeight: 'bold', cursor: 'pointer',
    zIndex: '9999', boxShadow: '0 4px 8px rgba(0,0,0,0.3)', fontFamily: 'sans-serif'
  });

  // 4. Button Click Logic (Open / Close)
  floatingBtn.addEventListener('click', () => {
    panel.classList.add('open');
    floatingBtn.style.display = 'none'; // Hide button when panel is open
  });

  document.getElementById('bt-close-btn')?.addEventListener('click', () => {
    panel.classList.remove('open');
    floatingBtn.style.display = 'block'; // Show button again
  });

  document.body.appendChild(floatingBtn);
}
