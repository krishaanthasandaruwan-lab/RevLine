// Career progress on this device: stars and best results per map, points, gems, bought parts and
// meter skins. Coins live in the backend garage (RevGarage credits, earn/spend).
// Requires career-data.js (REV_REGIONS, revRegionMaps), economy.js and tuning-store.js.
const REV_CAREER_KEY = 'revline-career-v1';
const REV_MAX_STARS = { easy: 1, normal: 2, hard: 3 };
const REV_STARTER_COINS = 2000;
// Creator mode: every round of the playable regions is open, for building and testing maps.
// The user asked for it on while the maps are being made; Home → Settings turns it off.
const REV_CREATOR_KEY = 'revline-creator-v1';

class RevCareerStore {
    constructor(storage, tuning = null) {
        this.storage = storage;
        this.state = { version: 1, stars: {}, best: {}, points: 0, gems: 0, threeStar: {}, regionsDone: {}, parts: [], skins: ['classic'], skin: 'classic', starter: false };
        let fresh = true;
        try {
            const saved = JSON.parse(storage.getItem(REV_CAREER_KEY));
            if (saved && saved.version === 1) { this.state = { ...this.state, ...saved }; fresh = false; }
        } catch {}
        // Parts fitted before the store existed stay owned.
        if (fresh && tuning) {
            for (const build of Object.values(tuning.cars)) for (const [category, id] of Object.entries(build)) this.addPart(`${category}:${id}`);
            this.save();
        }
    }

    save() { try { this.storage.setItem(REV_CAREER_KEY, JSON.stringify(this.state)); return true; } catch { return false; } }

    // New players get starter coins once, so the first upgrades are within reach.
    grantStarter(garage) {
        if (this.state.starter) return 0;
        this.state.starter = true;
        if (!this.save()) return 0;
        return garage.earn(REV_STARTER_COINS) ? 0 : REV_STARTER_COINS;
    }

    // Saved 'on' / 'off'; with no choice saved, RevCareerStore.creatorDefault applies.
    get creator() {
        let saved = null;
        try { saved = this.storage.getItem(REV_CREATOR_KEY); } catch {}
        return saved === 'on' || (saved !== 'off' && RevCareerStore.creatorDefault);
    }
    setCreator(on) { try { this.storage.setItem(REV_CREATOR_KEY, on ? 'on' : 'off'); } catch {} }

    // ---------- Progress ----------
    starsFor(mapId) { return this.state.stars[mapId] || 0; }
    regionStars(regionId) { return revRegionMaps(regionId).reduce((sum, map) => sum + this.starsFor(map.id), 0); }
    totalStars() { return Object.values(this.state.stars).reduce((a, b) => a + b, 0); }

    regionStatus(region) {
        const index = REV_REGIONS.indexOf(region);
        if (!region.developed) return { open: false, reason: 'coming' };
        if (index === 0 || this.creator) return { open: true };
        const previous = REV_REGIONS[index - 1], have = this.regionStars(previous.id);
        return have >= region.starsToUnlock ? { open: true } : { open: false, reason: 'stars', need: region.starsToUnlock, have, from: previous.name };
    }

    // Maps are played in order: the next one opens when the previous has at least one star.
    isMapOpen(map) {
        const region = REV_REGIONS.find(r => r.id === map.region);
        if (!this.regionStatus(region).open) return false;
        if (this.creator) return true;
        const maps = revRegionMaps(map.region);
        return map.index === 0 || this.starsFor(maps[map.index - 1].id) > 0;
    }

    currentMap(regionId) {
        const maps = revRegionMaps(regionId);
        return maps.find(map => this.isMapOpen(map) && this.starsFor(map.id) === 0) || maps.filter(map => this.isMapOpen(map)).at(-1) || null;
    }

    // ---------- Results ----------
    // Race maps: 1st place earns the difficulty's maximum (easy 1, normal 2, hard 3), 2nd one less.
    // Drift maps: one star per multiple of the drift target, capped the same way. Out = no stars.
    static starsEarned({ map, difficulty, place, finished, driftPoints = 0 }) {
        if (!finished) return 0;
        const max = REV_MAX_STARS[difficulty] || 1;
        if (map.type === 'drift') return Math.min(max, Math.floor(driftPoints / map.driftTarget), 3);
        return place === 1 ? max : place === 2 ? Math.max(0, max - 1) : 0;
    }

    record({ map, difficulty, place, finished, driftPoints = 0, score = 0, clean = false, time = 0 }, garage) {
        const stars = RevCareerStore.starsEarned({ map, difficulty, place, finished, driftPoints });
        const before = this.starsFor(map.id);
        const coins = map.type === 'drift'
            ? (finished ? Math.round(driftPoints * 2 * (REV_DIFFICULTY_COINS[difficulty] || 1) / 5) * 5 : 0)
            : revRaceCoins({ place, finished, difficulty, mapIndex: map.index, career: true });
        const points = finished ? Math.round(score + stars * 100 + (clean ? 150 : 0) + driftPoints) : 0;
        let gems = 0;
        if (stars > before) this.state.stars[map.id] = stars;
        if (stars === 3 && !this.state.threeStar[map.id]) { this.state.threeStar[map.id] = true; gems += 3; }
        const regionMaps = revRegionMaps(map.region);
        if (!this.state.regionsDone[map.region] && regionMaps.every(m => this.starsFor(m.id) > 0)) { this.state.regionsDone[map.region] = true; gems += 20; }
        this.state.gems += gems;
        this.state.points += points;
        const best = this.state.best[map.id];
        if (finished && (!best || points > best.points)) this.state.best[map.id] = { points, time, place };
        this.save();
        if (coins) garage.earn(coins);
        return { stars, newStars: Math.max(0, stars - before), coins, gems, points };
    }

    // ---------- Shop ----------
    ownsPart(key) { return (REV_PART_PRICES[key] ?? 0) === 0 || this.state.parts.includes(key); }
    addPart(key) { if (!this.state.parts.includes(key)) this.state.parts.push(key); }
    buyPart(key, garage) {
        if (this.ownsPart(key)) return '';
        const error = garage.spend(REV_PART_PRICES[key]);
        if (error) return error;
        this.addPart(key);
        return this.save() ? '' : 'Could not save the purchase.';
    }

    ownsSkin(id) { return this.state.skins.includes(id); }
    buySkin(id, garage) {
        const skin = REV_METER_SKINS[id];
        if (!skin || this.ownsSkin(id)) return '';
        if (skin.gems) {
            if (this.state.gems < skin.gems) return 'Not enough gems.';
            this.state.gems -= skin.gems;
        } else {
            const error = garage.spend(skin.coins);
            if (error) return error;
        }
        this.state.skins.push(id);
        return this.save() ? '' : 'Could not save the purchase.';
    }
    setSkin(id) { if (this.ownsSkin(id)) { this.state.skin = id; this.save(); } }
}

RevCareerStore.creatorDefault = true;

if (typeof module !== 'undefined') module.exports = { RevCareerStore, REV_MAX_STARS, REV_STARTER_COINS, REV_CREATOR_KEY };
