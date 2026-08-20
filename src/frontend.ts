import type { SpindleFrontendContext } from 'lumiverse-spindle-types';

export function setup(ctx: SpindleFrontendContext) {
  // Create the floating button
  const floatingBtn = document.createElement('div');
  floatingBtn.innerText = '🧬 BIO';
  
  // Style the button so it sits neatly in the bottom corner of your screen
  Object.assign(floatingBtn.style, {
    position: 'fixed',
    bottom: '80px',
    right: '20px',
    backgroundColor: '#ff4444',
    color: '#fff',
    padding: '12px 18px',
    borderRadius: '30px',
    fontWeight: 'bold',
    cursor: 'pointer',
    zIndex: '9999',
    boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
    fontFamily: 'sans-serif'
  });

  // What happens when you tap the button
  floatingBtn.addEventListener('click', () => {
    alert("Bio-Tracker Active!\n\nThe math engine is running in the background and silently updating your AI's prompt.");
  });

  // Add it to the Lumiverse interface
  document.body.appendChild(floatingBtn);
}
