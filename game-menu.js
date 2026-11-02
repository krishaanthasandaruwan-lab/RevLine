// Home, collection and garage are views of one local game menu, not separate simulators.
let gameMenuOpen = false, gameMenuView = 'home', storeCarId = 'gt', previewGeneration = 0;
function renderMenuArt() {
    document.querySelectorAll('canvas[data-car-color]').forEach(canvas => {
        const context = canvas.getContext('2d');
        const compact = canvas.width < 200;
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (!compact) {
            context.fillStyle = '#273039'; context.fillRect(0, 0, canvas.width, canvas.height);
            context.fillStyle = '#7a8389';
            for (const x of [canvas.width / 2 - 74, canvas.width / 2 + 74]) for (let y = 8; y < canvas.height; y += 44) context.fillRect(x, y, 3, 24);
        }
        context.save(); context.translate(canvas.width / 2, canvas.height / 2);
        const scale = compact ? .85 : 1.35; context.scale(scale, scale);
        drawRoundedCar(-23, -43, 46, 86, canvas.dataset.carColor, false, 0, context);
        context.restore();
    });
}
function showGameMenu(view = 'home', focus = true) {
    if (settingsDialog.open) closeSettings();
    stopGaragePreview(); clearHeldControls(); settingsPaused = true; settingsResumeReference = false;
    voiceInput.stop();
    gameMenuOpen = true;
    document.getElementById('game-menu').hidden = false;
    document.getElementById('ui-layer').inert = true;
    document.getElementById('overlay').inert = true;
    document.getElementById('settings-button').hidden = true;
    document.getElementById('home-button').hidden = true;
    setMenuView(view, focus);
}
function hideGameMenu() {
    stopGaragePreview(); gameMenuOpen = false; settingsPaused = false;
    document.getElementById('game-menu').hidden = true;
    document.getElementById('ui-layer').inert = false;
    document.getElementById('overlay').inert = false;
    document.getElementById('settings-button').hidden = false;
    document.getElementById('home-button').hidden = false;
}
function setMenuView(view, focus = true) {
    stopGaragePreview();
    gameMenuView = ['home', 'store', 'garage'].includes(view) ? view : 'home';
    document.querySelectorAll('[data-menu-view]').forEach(section => { section.hidden = section.dataset.menuView !== gameMenuView; });
    document.getElementById('menu-title').textContent = { home: 'RevLine', store: 'Store', garage: 'Garage' }[gameMenuView];
    document.getElementById('menu-back').hidden = gameMenuView === 'home';
    renderGarage(); renderStore(); renderMenuArt();
    document.getElementById('game-menu').scrollTop = 0;
    if (focus) document.getElementById('menu-title').focus({ preventScroll: true });
}
function enterDrive(racing) {
    document.getElementById('race-enabled').checked = racing;
    hideGameMenu(); applyCourseSettings();
    document.getElementById('overlay').innerHTML = `<h1>${racing ? 'Race · ' + raceLength / 1000 + ' km' : 'Free drive'}</h1><p>Tap N ↔ D to engage drive.<br>Use your voice to accelerate and change gears.</p><button class="action-btn" type="button" onclick="useMicrophone()">START WITH MICROPHONE</button><p data-input-status role="status" aria-live="polite" aria-atomic="true">Microphone access is needed for voice driving.</p><button class="test-btn" type="button" onclick="playReference(true)">Use sound test recording</button>`;
    document.getElementById('overlay').style.display = 'flex';
    document.querySelector('#overlay button').focus();
}
function renderGarageAction(category) {
    const id = document.getElementById(`shop-${category}`).value;
    const button = document.getElementById(`buy-${category}`);
    button.textContent = garage.state.equipped[category] === id ? 'Equipped' : category === 'car' ? 'Select car' : 'Fit part · free';
    button.disabled = garage.state.equipped[category] === id;
    if (category === 'engine') {
        const engine = REV_SHOP.engine.find(e => e.id === id);
        document.getElementById('preview-engine').textContent = `Preview ${engine.name}`;
    }
}
function renderGarage() {
    for (const category of Object.keys(REV_SHOP)) {
        const select = document.getElementById(`shop-${category}`); select.replaceChildren();
        const items = category === 'car' ? REV_SHOP.car.filter(c => garage.owns('car', c.id)) : REV_SHOP[category];
        for (const item of items) { const option = document.createElement('option'); option.value = item.id; option.textContent = item.name; select.append(option); }
        select.value = garage.state.equipped[category]; renderGarageAction(category);
    }
    for (const id of ['home-car-name', 'garage-car-name']) document.getElementById(id).textContent = garage.car.name;
    document.getElementById('home-engine-name').textContent = garage.engine.name;
    document.getElementById('race-menu-detail').textContent = `${raceLength / 1000} km · 3 opponents`;
    document.getElementById('garage-engine-name').textContent = garage.engine.name;
    const count = REV_SHOP.car.filter(c => garage.owns('car', c.id)).length;
    document.getElementById('owned-count').textContent = count;
    document.getElementById('owned-unit').textContent = count === 1 ? 'car' : 'cars';
    for (const id of ['home-car-art', 'garage-car-art']) document.getElementById(id).dataset.carColor = garage.car.color;
    renderMenuArt();
}
function equipGarage(category) {
    stopGaragePreview();
    const error = garage.equip(category, document.getElementById(`shop-${category}`).value);
    if (!error) { resetGame(); renderGarage(); renderLeaderboard(); drawBlueTachometer(); draw(); }
    document.getElementById('garage-status').textContent = error || `${garage.car.name} ready · ${garage.engine.name}.`;
}
function renderStore() {
    const list = document.getElementById('store-list'); list.replaceChildren();
    for (const car of REV_CARS) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'store-car';
        button.setAttribute('aria-pressed', String(storeCarId === car.id));
        const art = document.createElement('canvas'); art.width = 96; art.height = 112; art.dataset.carColor = car.color; art.setAttribute('aria-hidden', 'true');
        const name = document.createElement('strong'); name.textContent = car.name;
        const detail = document.createElement('span'); detail.textContent = car.note;
        const owned = document.createElement('small'); owned.textContent = garage.owns('car', car.id) ? 'In your garage' : 'Free · add to garage';
        button.append(art, name, detail, owned); button.onclick = () => selectStoreCar(car.id); list.append(button);
    }
    updateStoreSelection(); renderMenuArt();
}
function selectStoreCar(id) {
    if (!REV_CARS.some(c => c.id === id)) return;
    stopGaragePreview(); storeCarId = id;
    document.querySelectorAll('.store-car').forEach((button, index) => button.setAttribute('aria-pressed', String(REV_CARS[index].id === id)));
    updateStoreSelection();
}
function updateStoreSelection() {
    const car = REV_CARS.find(c => c.id === storeCarId);
    document.getElementById('store-selected').textContent = `${car.name} · ${car.note}`;
    const action = document.getElementById('claim-car');
    action.textContent = garage.owns('car', car.id) ? 'Owned · open Garage' : 'Add to garage · free';
    document.getElementById('store-preview').textContent = `Hear ${car.name}`;
}
function claimStoreCar() {
    stopGaragePreview();
    if (garage.owns('car', storeCarId)) { setMenuView('garage'); document.getElementById('shop-car').value = storeCarId; renderGarageAction('car'); return; }
    const error = garage.claim(storeCarId);
    document.getElementById('store-status').textContent = error || `${REV_CARS.find(c => c.id === storeCarId).name} added. Select it in your Garage.`;
    renderStore(); renderGarage();
}
function stopGaragePreview() {
    previewGeneration++; clearTimeout(shopPreviewTimer);
    document.getElementById('garage-audio').pause();
    for (const track of previewTracks) if (track.readyState === 'live') track.enabled = true;
    previewTracks = [];
    for (const id of ['preview-engine', 'store-preview']) { const button = document.getElementById(id); if (button) button.setAttribute('aria-pressed', 'false'); }
    if (typeof garage !== 'undefined') {
        const select = document.getElementById('shop-engine');
        const engine = REV_SHOP.engine.find(e => e.id === select.value) || garage.engine;
        document.getElementById('preview-engine').textContent = `Preview ${engine.name}`;
        const car = REV_CARS.find(c => c.id === storeCarId); document.getElementById('store-preview').textContent = `Hear ${car.name}`;
    }
}
async function previewGarageSound(fromStore = false) {
    const audio = document.getElementById('garage-audio');
    const button = document.getElementById(fromStore ? 'store-preview' : 'preview-engine');
    if (button.getAttribute('aria-pressed') === 'true') { stopGaragePreview(); return; }
    stopGaragePreview();
    const generation = previewGeneration;
    const engine = fromStore ? REV_SHOP.engine.find(e => e.id === REV_CARS.find(c => c.id === storeCarId).engine)
        : REV_SHOP.engine.find(e => e.id === document.getElementById('shop-engine').value);
    previewTracks = voiceInput.stream ? voiceInput.stream.getAudioTracks().filter(t => t.enabled) : [];
    for (const track of previewTracks) track.enabled = false;
    audio.src = `assets/engines/${engine.sound}.m4a`; audio.currentTime = 0;
    button.textContent = 'Loading sound…'; button.disabled = true;
    try {
        await audio.play();
        if (generation !== previewGeneration || !gameMenuOpen) return;
        button.textContent = 'Stop preview'; button.setAttribute('aria-pressed', 'true');
        shopPreviewTimer = setTimeout(stopGaragePreview, 3500);
    } catch {
        if (generation === previewGeneration) {
            stopGaragePreview(); document.getElementById(fromStore ? 'store-status' : 'garage-status').textContent = 'Sound could not play. Tap Preview to try again.';
        }
    } finally { button.disabled = false; }
}
