// Profile page: picture (own photo, Game Center photo or a colour with your initial), name,
// country, bio and stats. Other players see these in lobbies, races and results.
(() => {
    const storage = revOpenStorage();
    const garage = new RevGarage(storage);
    const tuning = new RevTuningStore(storage);
    const career = new RevCareerStore(storage, tuning);
    const profile = new RevProfileStore(storage);
    const $ = id => document.getElementById(id);

    // Back goes where the player came from (Home or Multiplayer).
    try { const from = new URL(document.referrer); if (from.origin === location.origin && !from.pathname.includes('/profile/')) $('pf-back').href = from.href; } catch {}

    function renderPhoto() {
        const p = profile.public();
        $('pf-photo').innerHTML = revAvatarHTML({ ...p, avatar: profile.state.avatar || p.avatar }, 120);
        $('pf-remove').hidden = !profile.state.avatar;
    }
    function renderStats() {
        const s = profile.state.stats;
        const rows = [['Races', s.races], ['Wins', s.wins], ['Podiums', s.podiums], ['Best time', s.bestTime ? `${Math.floor(s.bestTime / 60)}:${(s.bestTime % 60).toFixed(1).padStart(4, '0')}` : '–'],
            ['Career stars', career.totalStars()], ['Career points', career.state.points.toLocaleString('en-US')], ['Coins', garage.state.credits.toLocaleString('en-US')], ['Car', garage.car.name]];
        $('pf-stats').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${revEscape(v)}</dd></div>`).join('');
    }

    // Countries sorted by name, with flags; empty = not shown.
    const names = REV_COUNTRY_CODES.map(code => [code, revCountryName(code)]).sort((a, b) => a[1].localeCompare(b[1]));
    $('pf-country').innerHTML = `<option value="">🏁 Not set</option>${names.map(([code, name]) => `<option value="${code}">${revFlag(code)} ${revEscape(name)}</option>`).join('')}`;
    $('pf-name').value = profile.state.name; $('pf-country').value = profile.state.country; $('pf-bio').value = profile.state.bio;
    const count = () => { $('pf-bio-count').textContent = `${$('pf-bio').value.length} / ${REV_BIO_MAX}`; };
    $('pf-bio').addEventListener('input', count); count();

    $('pf-form').addEventListener('submit', event => {
        event.preventDefault();
        const error = profile.setName($('pf-name').value) || profile.setCountry($('pf-country').value) || profile.setBio($('pf-bio').value);
        $('pf-status').textContent = error || 'Saved. Other players see this in lobbies and results.';
        $('pf-status').dataset.error = String(Boolean(error));
        $('pf-name').value = profile.state.name; $('pf-bio').value = profile.state.bio; count(); renderPhoto();
    });

    // Square crop, then 256 px for this phone and 96 px (small JPEG) for other players.
    async function square(source, size, quality) {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d'), w = source.naturalWidth || source.width, h = source.naturalHeight || source.height, side = Math.min(w, h);
        ctx.drawImage(source, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
        return canvas.toDataURL('image/jpeg', quality);
    }
    function loadImage(src) { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; }); }
    async function usePicture(src) {
        try {
            const image = await loadImage(src);
            const error = profile.setAvatar(await square(image, 256, 0.86), await square(image, 96, 0.72));
            $('pf-status').textContent = error || 'Picture saved.';
        } catch { $('pf-status').textContent = 'That picture could not be used.'; }
        renderPhoto();
    }
    $('pf-file').addEventListener('change', () => {
        const file = $('pf-file').files[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        usePicture(url).finally(() => URL.revokeObjectURL(url));
        $('pf-file').value = '';
    });
    $('pf-colour').addEventListener('click', () => { profile.state.hue = Math.floor(Math.random() * 360); profile.save(); renderPhoto(); });
    $('pf-remove').addEventListener('click', () => { profile.setAvatar('', ''); renderPhoto(); });

    // Game Center: identity and its photo.
    revNet.auth().then(async me => {
        if (!me.ok) { $('pf-gc').textContent = `Game Center: not signed in (${me.error || 'sign in from Settings → Game Center'}). Your profile still works on this phone.`; return; }
        profile.linkGameCenter(me);
        if (!$('pf-name').value) $('pf-name').value = profile.state.name;
        $('pf-gc').textContent = revNet.kind === 'gamecenter' ? `Game Center: signed in as ${me.name}.` : 'Browser test mode (no Game Center).';
        if (revNet.kind === 'gamecenter') {
            $('pf-gc-photo').hidden = false;
            $('pf-gc-photo').addEventListener('click', async () => {
                const photo = await revNet.photo(me.id);
                if (photo) usePicture(photo); else $('pf-status').textContent = 'Your Game Center account has no photo.';
            });
        }
    });
    renderPhoto(); renderStats();
})();
