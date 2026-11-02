// Player profile on this device: name, bio, country, picture and multiplayer stats, plus a
// cache of other players met online (their name, country, bio and picture travel with them
// in a lobby). Game Center gives the identity; this store holds what Game Center cannot.
// Saved under 'revline-profile-v1'. A later online account can upload it unchanged.
const REV_PROFILE_KEY = 'revline-profile-v1';
const REV_NAME_MAX = 20, REV_BIO_MAX = 150;
// ISO 3166-1 alpha-2 codes; names come from Intl.DisplayNames, flags from regional indicators.
const REV_COUNTRY_CODES = ('AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BA BW BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UY UZ VU VE VN VG VI WF EH YE ZM ZW').split(' ');
const revFlag = code => /^[A-Z]{2}$/.test(code || '') ? String.fromCodePoint(...[...code].map(c => 0x1F1A5 + c.charCodeAt(0))) : '🏁';
function revCountryName(code) {
    try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code; } catch { return code; }
}
function revDefaultCountry() {
    try {
        const region = new Intl.Locale(navigator.language).maximize().region;
        if (REV_COUNTRY_CODES.includes(region)) return region;
    } catch {}
    return '';
}
// Names are shown to other players: trimmed, single-spaced, no control characters.
const revCleanText = (text, max) => String(text || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

class RevProfileStore {
    constructor(storage) {
        this.storage = storage;
        this.state = { version: 1, name: '', bio: '', country: revDefaultCountry(), avatar: '', avatarSmall: '', hue: Math.floor(Math.random() * 360),
            gameCenterId: '', stats: { races: 0, wins: 0, podiums: 0, bestTime: 0 }, players: {} };
        try {
            const saved = JSON.parse(storage.getItem(REV_PROFILE_KEY));
            if (saved && saved.version === 1) this.state = { ...this.state, ...saved, stats: { ...this.state.stats, ...saved.stats } };
        } catch {}
    }
    save() { try { this.storage.setItem(REV_PROFILE_KEY, JSON.stringify(this.state)); return ''; } catch { return 'Could not save your profile (device storage is full).'; } }

    get name() { return this.state.name || 'Racer'; }
    setName(name) {
        const clean = revCleanText(name, REV_NAME_MAX);
        if (clean.length < 2) return 'Use at least 2 letters.';
        this.state.name = clean; return this.save();
    }
    setBio(bio) { this.state.bio = revCleanText(bio, REV_BIO_MAX); return this.save(); }
    setCountry(code) {
        if (code && !REV_COUNTRY_CODES.includes(code)) return 'Choose a country from the list.';
        this.state.country = code || ''; return this.save();
    }
    // avatar: square data URL (256 px) for this device; small (96 px JPEG) is what others receive.
    setAvatar(avatar, small) {
        if (avatar && !/^data:image\/(png|jpeg|webp);base64,/.test(avatar)) return 'That picture could not be used.';
        this.state.avatar = avatar || ''; this.state.avatarSmall = small || ''; return this.save();
    }
    // Game Center gives the first name; the player can change it here afterwards.
    linkGameCenter({ id, name }) {
        this.state.gameCenterId = id || this.state.gameCenterId;
        if (!this.state.name && name) this.state.name = revCleanText(name, REV_NAME_MAX);
        this.save();
    }

    // What other players see in a lobby, race and results.
    public(extra = {}) {
        const { name, bio, country, avatarSmall, hue, stats } = this.state;
        return { name: name || 'Racer', bio, country, avatar: avatarSmall, hue, wins: stats.wins, races: stats.races, ...extra };
    }

    recordRace({ place, players, time = 0, finished = true }) {
        const s = this.state.stats;
        s.races += 1;
        if (finished && place === 1 && players > 1) s.wins += 1;
        if (finished && place <= 3) s.podiums += 1;
        if (finished && time > 0 && (!s.bestTime || time < s.bestTime)) s.bestTime = time;
        this.save();
        return { ...s };
    }

    // Other players' public profiles, remembered for leaderboards and friend lists.
    remember(id, profile) {
        if (!id || !profile) return;
        const clean = { name: revCleanText(profile.name, REV_NAME_MAX) || 'Racer', bio: revCleanText(profile.bio, REV_BIO_MAX),
            country: REV_COUNTRY_CODES.includes(profile.country) ? profile.country : '', hue: Number(profile.hue) || 0,
            avatar: /^data:image\/(png|jpeg|webp);base64,/.test(profile.avatar || '') && profile.avatar.length < 60000 ? profile.avatar : '', seen: Date.now() };
        this.state.players[id] = clean;
        // Keep the cache small: the 60 most recently met players.
        const ids = Object.keys(this.state.players);
        if (ids.length > 60) ids.sort((a, b) => this.state.players[a].seen - this.state.players[b].seen).slice(0, ids.length - 60).forEach(old => delete this.state.players[old]);
        this.save();
    }
    player(id) { return this.state.players[id] || null; }
}

// Safe text for HTML built from other players' names and bios.
const revEscape = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const REV_AVATAR_DATA = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
// A player's picture, or their initial on their colour when they have not chosen one.
function revAvatarHTML(profile = {}, size = 40) {
    if (REV_AVATAR_DATA.test(profile.avatar || '')) return `<img class="rl-avatar" src="${profile.avatar}" style="--size:${size}px" alt="">`;
    const hue = Number(profile.hue) || 200, initial = revEscape(String(profile.name || 'R').trim()[0]?.toUpperCase() || 'R');
    return `<span class="rl-avatar" style="--size:${size}px;--hue:${hue}" aria-hidden="true">${initial}</span>`;
}

if (typeof module !== 'undefined') module.exports = { revEscape, revAvatarHTML, RevProfileStore, REV_COUNTRY_CODES, REV_PROFILE_KEY, revFlag, revCountryName, revCleanText, revDefaultCountry };
