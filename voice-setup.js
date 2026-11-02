// Presentation and flow only. Capture, calibration and detection live in voice-input.js.
class RevVoiceSetupUI {
    constructor() {
        this.input = voiceInput; this.storage = gameStorage;
        this.dialog = document.getElementById('voice-setup-dialog');
        this.action = document.getElementById('voice-setup-action');
        this.feedback = document.getElementById('voice-setup-feedback');
        this.epoch = 0; this.frame = 0; this.busy = false; this.step = 'welcome';
        try { this.saved = RevVoiceCalibration.validate(JSON.parse(this.storage.getItem('revline-voice-profile-v1'))); } catch {}
        if (this.saved) this.input.usePersonalProfile(this.saved);
        this.updateProfileUI();
        this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.dialog.open) {
                this.abort(); this.input.stop(); this.step = 'welcome'; this.render();
                this.say('Setup paused. Come back to the app and tap Begin setup. Your saved profile is unchanged.', true);
            }
        });
        let seen = false; try { seen = this.storage.getItem('revline-voice-setup-seen-v1') === '1'; } catch {}
        if (!this.saved && !seen) this.open();
    }

    updateProfileUI() {
        const option = document.getElementById('personal-voice-option');
        option.disabled = !this.input.personalCalibration;
        option.textContent = option.disabled ? 'Your voice · complete setup' : 'Your voice';
        document.getElementById('personal-voice-status').textContent = this.sessionActive
            ? 'Your voice profile is active for this session. Set up again to save it on this device.' : this.saved
            ? 'Your voice profile is saved on this device. Set up again if your microphone or surroundings change.'
            : 'Learn the sound gestures and match the input to your voice. Setup starts a new run.';
        if (this.input.profileKey === 'voice-personal') applySoundProfile('voice-personal');
    }

    open() {
        if (this.dialog.open) return;
        this.previous = { calibration: this.input.personalCalibration, key: this.input.profileKey,
            settings: { ...this.input.settings['voice-personal'] } };
        this.accepted = false; this.sessionOnly = false;
        this.input.stop(); settingsResumeReference = false; closeSettings();
        stopGaragePreview(); clearHeldControls(); showGameMenu('home', false); resetGame();
        this.restart(); this.dialog.showModal(); document.getElementById('voice-setup-title').focus();
    }

    abort() { ++this.epoch; cancelAnimationFrame(this.frame); this.busy = false; }
    restart() {
        this.abort(); this.input.stop(); this.restore();
        this.measurement = new RevVoiceCalibration(); this.candidate = null;
        this.counts = { up: 0, down: 0 }; this.step = 'welcome'; this.render();
    }
    restore() {
        if (!this.previous) return;
        this.input.personalCalibration = this.previous.calibration;
        this.input.settings['voice-personal'] = { ...this.previous.settings };
        this.input.setProfile(this.previous.key);
    }
    close(markSeen = true) {
        this.abort(); this.input.stop();
        if (!this.accepted) this.restore();
        if (markSeen) { try { this.storage.setItem('revline-voice-setup-seen-v1', '1'); } catch {} }
        this.dialog.close(); this.updateProfileUI(); resetGame();
        showGameMenu('home', false);
        document.getElementById('home-voice-setup').focus({ preventScroll: true });
    }
    say(message, error = false) { this.feedback.textContent = message; this.feedback.classList.toggle('error', error); }

    render() {
        const copy = {
            welcome: ['Drive with your voice', 'We’ll listen to your rev and fit the controls to your voice. Then practise both gear changes. About a minute.', 'Begin setup'],
            quiet: ['First, stay quiet', 'Stay quiet for 3 seconds. We’ll measure the room before listening to your rev.', 'Measure room noise'],
            rev: ['Build a rev', 'Rev from low to high in a normal voice. Repeat for 5 seconds. No need to shout.', 'Listen to my rev'],
            up: ['Practise shifting up', 'Rev, make a very short break, then rev again. In a race, use the lit 7–10k window; 8.5–9.5k is perfect.', 'Try upshift'],
            down: ['Practise shifting down', 'Give one small rev and let it fall back. Keep the voice flowing instead of making the short upshift break.', 'Try downshift'],
            ready: ['Your voice is ready', 'Both sound cues were recognised twice. Save this profile, then choose Race or Free drive.', this.sessionOnly ? 'Use for this session' : 'Save voice profile']
        }[this.step];
        document.getElementById('voice-setup-title').textContent = copy[0];
        document.getElementById('voice-setup-copy').textContent = copy[1];
        const order = ['quiet', 'rev', 'up', 'down'];
        document.getElementById('voice-setup-step').textContent = order.includes(this.step) ? `Voice setup · ${order.indexOf(this.step) + 1} of 4` : 'Voice setup';
        this.action.textContent = copy[2]; this.action.disabled = this.busy;
        document.getElementById('voice-setup-close').textContent = this.step === 'welcome' ? 'Later' : 'Cancel setup';
        document.getElementById('voice-setup-back').hidden = this.step === 'welcome';
        document.getElementById('voice-setup-back').disabled = this.busy;
        const progress = document.getElementById('voice-setup-progress'); progress.hidden = !this.busy; progress.value = 0;
        const practice = this.step === 'up' || this.step === 'down';
        document.getElementById('voice-setup-cue').hidden = !practice;
        document.getElementById('setup-cue-path').setAttribute('d', this.step === 'up'
            ? 'M8 40L60 18L95 8L102 45L117 45L125 28L180 10L232 5'
            : 'M8 40L60 18L95 8L125 15L160 25L200 35L232 40');
        document.getElementById('setup-cue-label').textContent = practice ? `${this.step === 'up' ? '4 to 5 · short break' : '4 to 3 · lower pitch'} · ${this.counts[this.step]}/2 recognised` : '';
        this.meter(0);
        this.say(practice ? 'Practice window is open. Make one gesture per attempt.'
            : this.step === 'ready' ? 'Your pitch range and noise level are matched. No audio recording is saved.'
            : '7–10k: shift window · 8.5–9.5k: perfect timing.');
    }

    meter(press) {
        const level = Math.max(0, Math.min(1, press || 0));
        document.getElementById('setup-level-fill').style.transform = `scaleX(${level})`;
        document.getElementById('setup-needle').style.transform = `rotate(${level * 180}deg)`;
        document.getElementById('setup-level-label').textContent = this.busy ? 'Listening · your rev level' : 'Microphone listens only during setup attempts.';
    }

    async next() {
        if (this.busy) return;
        if (this.step === 'ready') { this.save(); return; }
        const epoch = ++this.epoch;
        if (this.step === 'welcome') {
            this.measurement = new RevVoiceCalibration(); this.candidate = null; this.counts = { up: 0, down: 0 };
            this.input.setProfile('voice-custom');
        }
        this.busy = true; this.render(); this.say('Opening microphone and loading voice pitch…');
        document.getElementById('voice-setup-progress').removeAttribute('value');
        try {
            let microphoneTimeout, opened;
            try {
                opened = await Promise.race([this.input.startMicrophone(), new Promise((_, reject) => {
                    microphoneTimeout = setTimeout(() => reject(new Error('Allow microphone access, then retry setup.')), 20000);
                })]);
            } finally { clearTimeout(microphoneTimeout); }
            if (epoch !== this.epoch) return;
            if (!opened) throw new Error('Microphone setup was interrupted. Try again.');
            let timeout;
            try {
                await Promise.race([this.input.ensureAI(true), new Promise((_, reject) => {
                    timeout = setTimeout(() => reject(new Error('Voice pitch took too long to load. Try again.')), 12000);
                })]);
            } finally { clearTimeout(timeout); }
            if (epoch !== this.epoch) return;
            if (this.input.ai.state !== 'ready') throw new Error('Voice pitch is unavailable. Retry when it has loaded.');
            if (this.step === 'welcome') {
                this.input.stopMicrophone(); this.busy = false; this.step = 'quiet'; this.render(); return;
            }
            this.input.model.reset(); this.input.blend.reset(); this.input.ai.reset();
            this.input.cut.reset(); this.input.upshift.reset(); this.input.downshift.reset();
            this.measurement.frames[this.step] && (this.measurement.frames[this.step] = []);
            this.listen(epoch);
        } catch (error) {
            if (epoch !== this.epoch) return;
            this.input.stop(); this.busy = false; this.render();
            this.say(`Microphone / voice pitch not ready. ${error.message || 'Check microphone permission and try again.'}`, true);
        }
    }

    listen(epoch) {
        const duration = this.step === 'quiet' ? 3 : this.step === 'rev' ? 5 : 7;
        let last = null, elapsed = 0;
        this.say(this.step === 'quiet' ? 'Listening to the room…' : 'Listening…');
        const tick = now => {
            if (epoch !== this.epoch || !this.dialog.open) return;
            const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000); last = now; elapsed += dt;
            const signal = this.input.analyze(dt, { aiEnabled: true, blendEnabled: document.getElementById('voice-blend').checked });
            if (signal) {
                this.meter(signal.press);
                if (this.step === 'quiet' || this.step === 'rev') this.measurement.observe(this.step, signal, dt);
                else {
                    const { direction } = this.input.detectShift(signal, signal.press, 4, dt, 2, { rpm: 8.8 });
                    if (direction) { this.finish(direction); return; }
                }
            }
            document.getElementById('voice-setup-progress').value = elapsed / duration;
            if (elapsed >= duration) { this.finish(null); return; }
            this.frame = requestAnimationFrame(tick);
        };
        this.frame = requestAnimationFrame(tick);
    }

    finish(direction) {
        this.input.stopMicrophone(); this.busy = false;
        let message = '', error = false;
        if (this.step === 'quiet') this.step = 'rev';
        else if (this.step === 'rev') {
            const result = this.measurement.fit();
            if (result.error) { message = result.error; error = true; }
            else {
                this.candidate = result.profile; this.input.usePersonalProfile(this.candidate, false);
                this.step = 'up';
            }
        } else if (direction === this.step) {
            this.counts[this.step]++;
            message = `${this.step === 'up' ? 'Upshift' : 'Downshift'} recognised · ${this.counts[this.step]}/2. ${this.counts[this.step] < 2 ? 'Try the same sound once more.' : 'Continue with the next step.'}`;
            if (this.counts[this.step] === 2) this.step = this.step === 'up' ? 'down' : 'ready';
        } else {
            this.counts[this.step] = 0; error = true;
            message = direction ? `We heard a ${direction === 'up' ? 'short upshift break' : 'falling downshift tone'}. ${this.step === 'up' ? 'Keep the break very short, then rev again.' : 'Lower the pitch steadily without a quiet break.'}`
                : 'No shift detected. Rev first, then try the gesture shown above. Use your normal voice.';
        }
        this.render(); if (message) this.say(message, error);
    }

    save() {
        const profile = RevVoiceCalibration.validate({ ...this.candidate, practice: { ...this.counts } });
        if (!profile) { this.say('Complete both practice steps before saving.', true); return; }
        if (!this.sessionOnly) {
            try { this.storage.setItem('revline-voice-profile-v1', JSON.stringify(profile)); }
            catch { this.sessionOnly = true; this.render(); this.say('Storage is unavailable. You can use this profile for this session, or cancel to keep your previous profile.', true); return; }
        }
        if (!this.sessionOnly) this.saved = profile;
        this.sessionActive = this.sessionOnly;
        this.input.usePersonalProfile(profile); this.accepted = true;
        this.close(); setStatus(this.sessionOnly ? 'Your voice profile is active for this session.' : 'Your voice profile is saved · choose Race or Free drive.');
    }
}

const voiceSetup = new RevVoiceSetupUI();
