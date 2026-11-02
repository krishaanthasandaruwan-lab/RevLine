// game.js calls the original Home / Store / Garage menu (game-menu.js). This page has a
// race lobby instead, so these keep the same names and pause semantics for the lobby.
// Load before game.js. Bodies read game.js globals only when they run.
let gameMenuOpen = false;

// The lobby keeps a live microphone open for up to a minute, so Start / Race again begins at
// once instead of reopening it (that took a second or two on iPhone and felt like missed
// taps). After a minute in the lobby, on leaving the page or in the background it closes.
const REV_LOBBY_MIC_GRACE = 60000;
let lobbyMicTimer = 0;
function showGameMenu() {
    if (settingsDialog.open) closeSettings();
    stopGaragePreview(); clearHeldControls();
    settingsPaused = true; settingsResumeReference = false;
    clearTimeout(lobbyMicTimer);
    if (voiceInput.mode === 'mic') lobbyMicTimer = setTimeout(() => { if (gameMenuOpen) voiceInput.stop(); }, REV_LOBBY_MIC_GRACE);
    else voiceInput.stop();
    gameMenuOpen = true;
    document.body.dataset.raceState = 'lobby';
}
window.addEventListener('pagehide', () => voiceInput.stop());
document.addEventListener('visibilitychange', () => { if (document.hidden && gameMenuOpen) voiceInput.stop(); });

function hideGameMenu() {
    clearTimeout(lobbyMicTimer);
    gameMenuOpen = false; settingsPaused = false;
    document.body.dataset.raceState = 'driving';
}

function renderGarage() { document.dispatchEvent(new CustomEvent('revline:garage')); }
function renderStore() {}
function stopGaragePreview() { document.getElementById('garage-audio')?.pause(); }
