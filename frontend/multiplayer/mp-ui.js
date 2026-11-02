// Multiplayer screen: online search, friends lobby (code, copy, share, invite), host race
// settings, friends list and leaderboard. Network: net.js (Game Center or the browser
// simulator); lobby rules: lobby.js.
(() => {
    const storage = revOpenStorage();
    const garage = new RevGarage(storage);
    const tuning = new RevTuningStore(storage);
    const career = new RevCareerStore(storage, tuning);
    const profile = new RevProfileStore(storage);
    let session = null; try { session = sessionStorage; } catch {}
    const myPublic = () => profile.public({ carId: garage.car.id, color: garage.car.color, style: garage.car.style || garage.car.id, stars: career.totalStars() });
    const lobby = new RevLobby(revNet, myPublic, session);
    const $ = id => document.getElementById(id);
    const MAPS = Object.values(REV_MAPS);
    const ONLINE_START_DELAY = 6;   // seconds an online lobby waits for more players
    let view = 'hub', board = 'wins', scope = 'global', onlineTimer = 0, onlineCountdown = 0;

    // ---------- Shell ----------
    function show(name) {
        view = name;
        for (const section of document.querySelectorAll('.mp-view')) section.hidden = section.id !== `view-${name}`;
        if (name === 'friends') renderFriends();
        if (name === 'board') renderBoard();
        if (name === 'lobby') renderLobby();
    }
    function toast(text) {
        const out = $('mp-toast'); out.textContent = text; out.hidden = false;
        clearTimeout(toast.timer); toast.timer = setTimeout(() => { out.hidden = true; }, 2600);
    }
    function renderMe() {
        const p = profile.public();
        $('me-chip').innerHTML = `${revAvatarHTML(p, 34)}<span>${revFlag(p.country)} ${revEscape(p.name)}</span>`;
    }
    for (const button of document.querySelectorAll('.back-hub')) button.addEventListener('click', () => show('hub'));

    // ---------- Online ----------
    $('go-online').addEventListener('click', async () => {
        lobby.open({ mode: 'online' });
        show('search');
        $('search-detail').textContent = 'Races start with 2 to 4 players. The track is chosen automatically.';
        const match = await revNet.find({ mode: 'online' });
        if (!match) { lobby.clear(); show('hub'); return; }
        show('lobby');
    });
    $('cancel-search').addEventListener('click', async () => { await revNet.cancel(); await revNet.leave(); lobby.clear(); show('hub'); });
    async function refreshActivity() {
        const count = await revNet.searching();
        $('online-detail').textContent = count ? `${count} player${count === 1 ? '' : 's'} searching now` : 'Race players who are online now';
    }

    // Online lobbies start on their own: at 4 players, or a few seconds after the second joins.
    function onlineAutoStart() {
        clearInterval(onlineTimer);
        if (lobby.state.mode !== 'online' || lobby.state.phase !== 'lobby' || lobby.members.length < 2) { onlineCountdown = 0; return; }
        onlineCountdown = lobby.members.length >= 4 ? 1 : ONLINE_START_DELAY;
        onlineTimer = setInterval(() => {
            onlineCountdown -= 1;
            renderLobbyActions();
            if (onlineCountdown <= 0) { clearInterval(onlineTimer); if (lobby.isHost) lobby.start(MAPS); }
        }, 1000);
    }

    // ---------- Friends lobby ----------
    async function createLobby() {
        const code = revNewCode();
        lobby.open({ mode: 'code', code, host: true });
        show('lobby');
        revNet.find({ mode: 'code', code });
        return code;
    }
    async function joinLobby(raw) {
        const code = String(raw || '').replace(/\D/g, '');
        if (code.length !== 6) { toast('Enter the 6-digit code from your friend.'); return; }
        lobby.open({ mode: 'code', code, host: false });
        show('lobby');
        const match = await revNet.find({ mode: 'code', code });
        if (!match && lobby.state.code === code) { toast('Could not join that lobby.'); lobby.clear(); show('hub'); }
    }
    $('create-lobby').addEventListener('click', createLobby);
    $('join-form').addEventListener('submit', event => { event.preventDefault(); joinLobby($('join-code').value); });

    async function leaveLobby() {
        clearInterval(onlineTimer);
        await revNet.cancel(); await revNet.leave();
        lobby.clear(); show('hub');
    }

    // ---------- Lobby rendering ----------
    lobby.subscribe(state => {
        if (state.phase === 'race') { location.href = 'frontend/race/index.html?mp=1'; return; }
        if (state.mode && view !== 'lobby' && view !== 'search') return;
        if (state.mode === 'online' && view === 'search' && lobby.members.length >= 2) show('lobby');
        else if (view === 'lobby') renderLobby();
        if (state.mode === 'online') onlineAutoStart();
    });
    for (const m of lobby.members) profile.remember(m.id, m.profile);

    function renderLobby() {
        const s = lobby.state;
        if (!s.mode) { show('hub'); return; }
        for (const m of lobby.members) if (m.id !== lobby.me) profile.remember(m.id, m.profile);
        const online = s.mode === 'online';
        $('lobby-head').innerHTML = online
            ? `<p class="rl-label">Online race</p><h2>${lobby.members.length} of 4 players</h2><p class="mp-hint">Matched with players online now. The track is chosen automatically.</p>`
            : `<p class="rl-label">Friends lobby${lobby.isHost ? ' · you are the host' : ''}</p>
               <div class="code" aria-label="Lobby code">${s.code.slice(0, 3)} ${s.code.slice(3)}</div>
               <div class="share-row">
                   <button type="button" class="rl-btn rl-btn--green rl-btn--small" data-act="share">Share link</button>
                   <button type="button" class="rl-btn rl-btn--dark rl-btn--small" data-act="copy-link">Copy link</button>
                   <button type="button" class="rl-btn rl-btn--dark rl-btn--small" data-act="copy-code">Copy code</button>
                   <button type="button" class="rl-btn rl-btn--orange rl-btn--small" data-act="invite">Invite friends</button>
               </div>`;
        const slots = [...lobby.members];
        while (slots.length < 4) slots.push(null);
        $('members').innerHTML = slots.map(m => {
            if (!m) return `<li class="member empty"><span class="rl-avatar" style="--size:44px;--hue:220">?</span><div><strong>Waiting for a player…</strong><span>${online ? 'Searching online' : 'Share the code or invite a friend'}</span></div></li>`;
            const p = m.profile || {}, host = m.id === s.hostId;
            return `<li class="member${m.id === lobby.me ? ' me' : ''}">${revAvatarHTML(p, 44)}
                <div><strong>${revFlag(p.country)} ${revEscape(p.name || 'Racer')}${m.id === lobby.me ? ' (you)' : ''}</strong>
                <span>${p.bio ? revEscape(p.bio) : `${p.wins || 0} wins · ${p.races || 0} races`}</span></div>
                ${host ? '<b class="tag host">Host</b>' : m.ready ? '<b class="tag ready">Ready</b>' : '<b class="tag">Not ready</b>'}</li>`;
        }).join('');
        renderSettings();
        renderResults();
        renderLobbyActions();
    }

    $('lobby-head').addEventListener('click', async event => {
        const act = event.target.closest('[data-act]')?.dataset.act, code = lobby.state.code;
        if (!act) return;
        if (act === 'share') { await revNet.share({ text: revInviteText(code), url: revInviteUrl(code) }); }
        if (act === 'copy-link') toast(await revCopy(`${revInviteText(code)} ${revInviteUrl(code)}`) ? 'Invite link copied. Paste it in WhatsApp or any chat.' : 'Could not copy.');
        if (act === 'copy-code') toast(await revCopy(code) ? `Code ${code} copied.` : 'Could not copy.');
        if (act === 'invite') show('friends');
    });

    // Host settings: a career round or a custom road. Everyone else sees a summary.
    const CURVE_STEPS = [[0, 'Straight'], [0.5, 'Gentle'], [0.8, 'Bends'], [1.15, 'Sharp']];
    function settingsSummary(st) {
        if (st.source === 'career' && REV_MAPS[st.map]) {
            const map = REV_MAPS[st.map], region = REV_REGIONS.find(r => r.id === map.region);
            return `${region.name} · Round ${map.index + 1}: ${map.name} · ${map.distance / 1000} km · AI ${st.difficulty}`;
        }
        const curve = CURVE_STEPS.reduce((best, step) => Math.abs(step[0] - st.curves) < Math.abs(best[0] - st.curves) ? step : best)[1];
        return `Custom · ${st.distance / 1000} km · ${curve} · ${st.traffic ? 'traffic' : 'no traffic'} · ${st.surface} · AI ${st.difficulty}`;
    }
    function renderSettings() {
        const st = lobby.state.settings, box = $('lobby-settings');
        if (lobby.state.mode === 'online') { box.innerHTML = '<h3>Race</h3><p class="mp-hint">Chosen automatically when the race starts.</p>'; return; }
        if (!lobby.isHost) { box.innerHTML = `<h3>Race</h3><p class="summary">${revEscape(settingsSummary(st))}</p><p class="mp-hint">The host chooses the race.</p>`; return; }
        const regions = REV_REGIONS.filter(r => r.developed);
        const map = REV_MAPS[st.map] || revRegionMaps('r1')[0];
        const chip = (group, value, label, on) => `<button type="button" class="rl-chip" data-set="${group}" data-value="${value}" aria-pressed="${on}">${label}</button>`;
        box.innerHTML = `<h3>Race <span class="mp-hint">· you choose</span></h3>
            <div class="seg">${chip('source', 'career', 'Career round', st.source === 'career')}${chip('source', 'custom', 'Custom road', st.source === 'custom')}</div>
            ${st.source === 'career' ? `
                <label class="field">Region<select id="set-region">${regions.map(r => `<option value="${r.id}"${r.id === map.region ? ' selected' : ''}>${r.index + 1}. ${revEscape(r.name)}</option>`).join('')}</select></label>
                <label class="field">Round<select id="set-map">${revRegionMaps(map.region).map(m => `<option value="${m.id}"${m.id === map.id ? ' selected' : ''}>${m.index + 1}. ${revEscape(m.name)}${m.type === 'drift' ? ' (drift road)' : ''}</option>`).join('')}</select></label>` : `
                <div class="row"><span class="rl-label">Distance</span><div class="seg">${[1000, 3000, 5000].map(d => chip('distance', d, `${d / 1000} km`, st.distance === d)).join('')}</div></div>
                <div class="row"><span class="rl-label">Road</span><div class="seg">${CURVE_STEPS.map(([v, l]) => chip('curves', v, l, Math.abs(st.curves - v) < 0.01)).join('')}</div></div>
                <div class="row"><span class="rl-label">Surface</span><div class="seg">${['tarmac', 'gravel', 'dirt', 'sand', 'snow'].map(v => chip('surface', v, v[0].toUpperCase() + v.slice(1), st.surface === v)).join('')}</div></div>
                <div class="row"><span class="rl-label">Traffic</span><div class="seg">${chip('traffic', 'false', 'Off', !st.traffic)}${chip('traffic', 'true', 'On', st.traffic)}</div></div>`}
            <div class="row"><span class="rl-label">AI cars</span><div class="seg">${['easy', 'normal', 'hard'].map(v => chip('difficulty', v, v[0].toUpperCase() + v.slice(1), st.difficulty === v)).join('')}</div></div>
            <p class="mp-hint">Empty places on the grid are filled with AI cars. "Next round" keeps these settings.</p>`;
        $('set-region')?.addEventListener('change', e => { const first = revRegionMaps(e.target.value)[0]; applyMap(first); });
        $('set-map')?.addEventListener('change', e => applyMap(REV_MAPS[e.target.value]));
    }
    function applyMap(map) {
        lobby.setSettings({ ...lobby.state.settings, source: 'career', map: map.id, distance: map.distance, curves: map.curves, traffic: map.traffic, surface: map.surface, theme: map.theme });
    }
    $('lobby-settings').addEventListener('click', event => {
        const button = event.target.closest('[data-set]');
        if (!button || !lobby.isHost) return;
        const key = button.dataset.set, raw = button.dataset.value, st = { ...lobby.state.settings };
        if (key === 'source' && raw === 'career') { applyMap(REV_MAPS[st.map] || revRegionMaps('r1')[0]); return; }
        st[key] = key === 'traffic' ? raw === 'true' : key === 'distance' || key === 'curves' ? Number(raw) : raw;
        if (key === 'source') st.map = null;
        if (key === 'surface') st.theme = { tarmac: 'grass', gravel: 'gravel', dirt: 'dirt', sand: 'desert', snow: 'snow' }[raw];
        lobby.setSettings(st);
    });

    function renderResults() {
        const r = lobby.state.results, box = $('last-results');
        box.hidden = !r;
        if (!r) return;
        const members = Object.fromEntries(lobby.members.map(m => [m.id, m.profile]));
        box.innerHTML = `<h3>Round ${r.round} results</h3><ol class="mini-results">${r.order.map(e => {
            const p = members[e.id] || profile.player(e.id) || { name: e.name };
            return `<li><b>${e.place}</b>${revAvatarHTML(p, 26)}<span>${revFlag(p.country)} ${revEscape(p.name || e.name)}</span><em>${e.out ? 'Out' : e.time ? `${Math.floor(e.time / 60)}:${(e.time % 60).toFixed(1).padStart(4, '0')}` : `${e.distance || 0} m`}</em></li>`;
        }).join('')}</ol>`;
    }

    function renderLobbyActions() {
        const box = $('lobby-actions'), me = lobby.state.members[lobby.me];
        if (!box || view !== 'lobby') return;
        const enough = lobby.members.length >= 2;
        let main = '';
        if (lobby.state.mode === 'online') main = `<p class="mp-hint">${enough ? `Race starts in ${Math.max(0, onlineCountdown)} s…` : 'Waiting for another player…'}</p>`;
        else if (lobby.isHost) main = `<button type="button" class="rl-btn rl-btn--yellow" id="start-race" ${enough && lobby.everyoneReady ? '' : 'disabled'}>${lobby.state.round ? 'Next round' : 'Start race'}</button>
            <p class="mp-hint">${!enough ? 'Waiting for at least one friend to join.' : lobby.everyoneReady ? 'Everyone is ready.' : 'Waiting for players to tap Ready.'}</p>`;
        else main = `<button type="button" class="rl-btn ${me?.ready ? 'rl-btn--dark' : 'rl-btn--green'}" id="toggle-ready">${me?.ready ? 'Not ready' : 'Ready'}</button>`;
        box.innerHTML = `${main}<button type="button" class="rl-btn rl-btn--dark rl-btn--small" id="leave-lobby">Leave</button>`;
        $('start-race')?.addEventListener('click', () => lobby.start(MAPS));
        $('toggle-ready')?.addEventListener('click', () => lobby.setReady(!me?.ready));
        $('leave-lobby').addEventListener('click', leaveLobby);
    }

    // ---------- Friends ----------
    async function renderFriends() {
        const list = $('friends');
        list.innerHTML = '<li class="mp-hint">Loading friends…</li>';
        $('friends-hint').textContent = revNet.kind === 'gamecenter'
            ? 'Your Game Center friends. Invite them to your lobby; they get a Game Center notification.'
            : 'Browser test mode: other RevLine tabs that are open now appear here.';
        let friends = [];
        try { friends = await revNet.friends(); } catch (error) { list.innerHTML = `<li class="mp-hint">${revEscape(error.message || 'Friends are not available.')}</li>`; return; }
        if (!friends.length) { list.innerHTML = '<li class="mp-hint">No friends yet. Tap Add friend, or share a lobby link.</li>'; return; }
        list.innerHTML = friends.map(f => {
            const p = profile.player(f.id) || { name: f.name };
            return `<li class="person">${revAvatarHTML(p, 40)}<div><strong>${revFlag(p.country)} ${revEscape(f.name || p.name)}</strong><span>${p.bio ? revEscape(p.bio) : 'RevLine racer'}</span></div>
                <button type="button" class="rl-btn rl-btn--yellow rl-btn--small" data-invite="${revEscape(f.id)}">Invite</button></li>`;
        }).join('');
    }
    $('friends').addEventListener('click', async event => {
        const id = event.target.closest('[data-invite]')?.dataset.invite;
        if (!id) return;
        const code = lobby.state.mode === 'code' ? lobby.state.code : await createLobby();
        await revNet.invite([id], code);
        toast('Invite sent.');
        show('lobby');
    });
    $('add-friend').addEventListener('click', async () => { const ok = await revNet.addFriend().catch(() => false); if (!ok && revNet.kind !== 'gamecenter') toast('Adding friends works in the iPhone app (Game Center).'); });
    $('go-friends').addEventListener('click', () => show('friends'));

    // ---------- Leaderboard ----------
    async function renderBoard() {
        $('open-gc').hidden = revNet.kind !== 'gamecenter';
        document.querySelectorAll('#board-tabs [data-board]').forEach(t => t.setAttribute('aria-selected', String(t.dataset.board === board)));
        document.querySelectorAll('#board-scope [data-scope]').forEach(t => t.setAttribute('aria-selected', String(t.dataset.scope === scope)));
        const list = $('board');
        list.innerHTML = '<li class="mp-hint">Loading…</li>';
        let data;
        try { data = await revNet.leaderboard(board, scope); } catch (error) { list.innerHTML = `<li class="mp-hint">${revEscape(error.message || 'The leaderboard is not available.')}</li>`; return; }
        if (!data?.entries?.length) { list.innerHTML = '<li class="mp-hint">No scores yet. Win a race to get on the board!</li>'; return; }
        list.innerHTML = data.entries.map(e => {
            const mine = e.id === revNet.me?.id, p = mine ? profile.public() : profile.player(e.id) || { name: e.name, hue: (e.rank * 47) % 360 };
            return `<li class="${mine ? 'me' : ''}${e.rank <= 3 ? ` top top${e.rank}` : ''}"><b>${e.rank}</b>${revAvatarHTML({ ...p, name: e.name }, 36)}
                <span>${revFlag(p.country)} ${revEscape(e.name)}</span><em>${Number(e.score).toLocaleString('en-US')}</em></li>`;
        }).join('');
    }
    $('board-tabs').addEventListener('click', e => { const b = e.target.closest('[data-board]')?.dataset.board; if (b) { board = b; renderBoard(); } });
    $('board-scope').addEventListener('click', e => { const s = e.target.closest('[data-scope]')?.dataset.scope; if (s) { scope = s; renderBoard(); } });
    $('open-gc').addEventListener('click', () => revNet.dashboard());
    $('go-board').addEventListener('click', () => show('board'));

    // Invitations from friends (Game Center notification, or another test tab).
    revNet.on('invite', ({ code, from }) => {
        if (lobby.state.mode) return;
        if (code) joinLobby(code);
        else toast(`${from?.name || 'A friend'} invited you.`);
    });
    // Game Center opened the app from an invite: the match already exists.
    revNet.on('matched', () => { if (!lobby.state.mode) { lobby.open({ mode: 'code', code: '', host: false }); show('lobby'); } });

    // ---------- Start ----------
    async function start() {
        renderMe();
        const me = await revNet.auth();
        if (me.ok) {
            profile.linkGameCenter(me);
            renderMe();
            $('mp-status').textContent = revNet.kind === 'gamecenter' ? `Game Center: signed in as ${me.name}` : 'Browser test mode: open RevLine in more tabs to play against yourself.';
            // Keep the leaderboards current with this player's career too.
            revNet.submitScore('stars', career.totalStars());
            revNet.submitScore('points', career.state.points);
            revNet.submitScore('wins', profile.state.stats.wins);
        } else {
            $('mp-status').textContent = `Game Center is not available: ${me.error || 'sign in from Settings → Game Center'}.`;
            $('mp-status').dataset.error = 'true';
        }
        const params = new URLSearchParams(location.search), join = params.get('join');
        // Opened from a Game Center invite: the native side already joined the match.
        if (params.get('invited') === '1' && !lobby.state.mode) {
            const match = await revNet.resume();
            if (match) { lobby.open({ mode: 'code', code: String(Math.max(0, (match.group || 0) - 1000)).padStart(6, '0'), host: false }); lobby.onPlayers(match.players || []); show('lobby'); }
        }
        // Coming back from a race (or a page reload): stay in the lobby if the match is still there.
        if (lobby.state.mode) {
            const resumed = await revNet.resume();
            if (resumed) { if (lobby.state.phase === 'race' || lobby.state.phase === 'results') { lobby.state.phase = 'lobby'; lobby.changed(); } show('lobby'); lobby.hello(); }
            else lobby.clear();
        }
        if (join && !lobby.state.mode) joinLobby(join);
        refreshActivity(); setInterval(refreshActivity, 15000);
    }
    start();
})();
