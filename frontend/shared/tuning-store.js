// Per-car sound build (exhaust, turbo variant, blow-off, intake), saved on this device.
// Kept in its own key so the backend's 'revline-garage-v1' validation stays untouched.
// The backend still owns the turbo on/off state (REV_SHOP.turbo); see effective().
// Requires frontend/garage/parts-catalog.js.
const REV_TUNING_KEY = 'revline-tuning-v1';

class RevTuningStore {
    constructor(storage) {
        this.storage = storage;
        this.cars = {};
        try {
            const saved = JSON.parse(storage.getItem(REV_TUNING_KEY));
            if (saved && saved.version === 1 && saved.cars && typeof saved.cars === 'object') {
                for (const [carId, build] of Object.entries(saved.cars)) if (/^[a-z0-9]{1,16}$/.test(carId)) this.cars[carId] = this.clean(build);
            }
        } catch {}
    }

    clean(build) {
        const result = { ...REV_STOCK_BUILD };
        for (const category of Object.keys(REV_PARTS)) {
            if (build && REV_PARTS[category].some(part => part.id === build[category])) result[category] = build[category];
        }
        return result;
    }

    build(carId) { return { ...(this.cars[carId] || REV_STOCK_BUILD) }; }

    set(carId, category, partId) {
        if (!Object.hasOwn(REV_PARTS, category) || !REV_PARTS[category].some(part => part.id === partId)) return 'Choose an available part.';
        const next = { ...this.cars, [carId]: { ...this.build(carId), [category]: partId } };
        try {
            this.storage.setItem(REV_TUNING_KEY, JSON.stringify({ version: 1, cars: next }));
            this.cars = next;
            return '';
        } catch { return 'Could not save on this device. Your previous build is still fitted.'; }
    }

    // The saved turbo variant applies only while it agrees with the backend's on/off turbo.
    effective(carId, backendTurbo) {
        const build = this.build(carId);
        const backend = revPart('turbo', build.turbo).backend;
        if (backend !== backendTurbo) build.turbo = backendTurbo === 'street' ? 'street' : 'none';
        return build;
    }
}

function revOpenStorage() {
    try { return window.localStorage; } catch { return { getItem: () => null, setItem: () => { throw new Error('Storage unavailable'); } }; }
}
