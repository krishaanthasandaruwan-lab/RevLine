// Game screens never zoom: block pinch (iOS gesture events and two-finger moves). Double-tap
// zoom is off through `touch-action: manipulation` (theme.css) and the viewport, so quick
// repeated taps (steering, buttons) still arrive as taps. The iOS app also disables zoom natively.
(() => {
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, e => e.preventDefault(), { passive: false });
    document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
    document.addEventListener('dblclick', e => e.preventDefault());
})();
