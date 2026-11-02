const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { RevVoiceInput, RevPersonalVoiceInput } = require('../voice-input.js');

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const stream = () => ({ stopped: false, getTracks() { return [{ stop: () => { this.stopped = true; } }]; } });
const original = Object.fromEntries(['window', 'navigator', 'setTimeout', 'clearTimeout'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const timers = new Map(); let timerId = 0;
const setGlobal = (key, value) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
setGlobal('setTimeout', callback => { timers.set(++timerId, callback); return timerId; });
setGlobal('clearTimeout', id => timers.delete(id));
let permission, capture;
setGlobal('window', { webkit: { messageHandlers: { microphonePermission: { postMessage: () => permission() } } } });
setGlobal('navigator', { mediaDevices: { getUserMedia: options => capture(options) } });
function input(Type = RevVoiceInput) {
    const voice = new Type({ pause() { this.paused = true; } });
    voice.initAudio = () => { voice.context ||= { resume: async () => {}, suspend() {}, createMediaStreamSource: () => ({ connect() {}, disconnect() {} }) }; };
    return voice;
}

// Exercise the real game entry point and its live regions, not a second startup implementation.
const source = fs.readFileSync(require.resolve('../game.js'), 'utf8');
const routine = name => {
    let start = source.indexOf(`async function ${name}(`);
    if (start < 0) start = source.indexOf(`function ${name}(`);
    assert(start >= 0, name);
    return source.slice(start, source.indexOf('\n}', start) + 2);
};
function ui() {
    const element = () => ({ textContent: '', style: {}, attributes: {}, disabled: false,
        classList: { toggle() {} }, setAttribute(key, value) { this.attributes[key] = value; }, removeAttribute(key) { delete this.attributes[key]; } });
    const status = element(), lobbyStatus = element(), button = element(), overlay = element();
    const state = { microphoneStarting: false, controlMode: 'voice', testStatus: status, running: false, lastFrameTime: 0,
        voiceInput: { mode: 'none' }, closes: 0, hides: 0, profiles: 0, frames: 0,
        document: {
            querySelectorAll: selector => selector === '[data-input-status]' ? [lobbyStatus] : [button],
            getElementById: id => id === 'overlay' ? overlay : id === 'input-profile' ? { value: 'voice-custom' } : element()
        },
        getSoundProfile: () => 'voice', applySoundProfile() { state.profiles++; },
        closeSettings() { state.closes++; }, hideGameMenu() { state.hides++; },
        requestAnimationFrame() { state.frames++; }, update() {}
    };
    vm.createContext(state);
    vm.runInContext(['setStatus', 'startLoop', 'reportMicrophoneError', 'useMicrophone'].map(routine).join('\n'), state);
    return { state, status, lobbyStatus, button, overlay };
}

(async () => {
    try {
        const order = [];
        permission = async () => { order.push('permission'); return true; };
        capture = async ({ audio }) => { order.push('capture'); assert.equal(audio.noiseSuppression, false); assert.equal(audio.autoGainControl, false); return stream(); };
        const mic = input(); assert.equal(await mic.startMicrophone(), true);
        assert.deepEqual(order, ['permission', 'capture']); assert.equal(mic.mode, 'mic');
        mic.stop(); assert.equal(timers.size, 0);

        // Echo cancellation remains the only constraint difference between personal/raw capture.
        for (const echoCancellation of [false, true]) {
            const personal = input(RevPersonalVoiceInput); personal.echoCancellation = echoCancellation;
            capture = async ({ audio }) => { assert.equal(audio.echoCancellation, echoCancellation); return stream(); };
            assert.equal(await personal.startMicrophone(), true); personal.stop();
        }

        permission = async () => false;
        capture = () => { throw Error('Capture must not run after native denial'); };
        const denied = input(); await assert.rejects(denied.startMicrophone(), { name: 'NotAllowedError' });
        assert.equal(denied.mode, 'none'); assert.equal(denied.reference.paused, true);

        permission = async () => true;
        capture = async () => { throw new DOMException('Device permission was denied', 'NotAllowedError'); };
        await assert.rejects(denied.startMicrophone(), { name: 'NotAllowedError' });
        capture = async () => stream(); assert.equal(await denied.startMicrophone(), true); denied.stop();

        // A suspended audio engine cannot prevent permission/capture from being requested.
        const resumed = deferred(), captured = stream(), suspended = input(); suspended.initAudio();
        suspended.context.resume = () => resumed.promise;
        capture = async () => captured;
        const startup = suspended.startMicrophone(); await flush();
        assert.equal(suspended.stream, captured); assert.equal(suspended.mode, 'none');
        assert.equal(timers.size, 1); [...timers.values()][0]();
        await assert.rejects(startup, { name: 'TimeoutError' });
        assert(captured.stopped); resumed.resolve(); await flush(); assert.equal(suspended.mode, 'none');

        // A result arriving after timeout is closed rather than silently restarting the microphone.
        const late = deferred(), timed = input(); capture = () => late.promise;
        const timedStart = timed.startMicrophone(); await flush(); [...timers.values()][0]();
        await assert.rejects(timedStart, { name: 'TimeoutError' });
        const lateStream = stream(); late.resolve(lateStream); await flush();
        assert(lateStream.stopped); assert.equal(timed.mode, 'none');

        // Leaving while the OS prompt is open must not start capture later.
        const grant = deferred(), cancelled = input(); permission = () => grant.promise;
        const cancelStart = cancelled.startMicrophone(); cancelled.stop(); grant.resolve(true);
        capture = () => { throw Error('Cancelled prompt must not open capture'); };
        assert.equal(await cancelStart, false);

        // Selecting the recording explicitly wins over a pending microphone attempt.
        permission = async () => true; const pendingCapture = deferred(), switched = input(); capture = () => pendingCapture.promise;
        const switchedStart = switched.startMicrophone(); await flush();
        switched.initAudio(); switched.context.createMediaElementSource = () => ({ connect() {} });
        await switched.prepareReference(); const staleStream = stream(); pendingCapture.resolve(staleStream);
        assert.equal(await switchedStart, false); assert(staleStream.stopped); assert.equal(switched.mode, 'reference');

        // Browser mode still requests capture when the native bridge is absent.
        delete window.webkit; capture = async () => stream();
        const browser = input(); assert.equal(await browser.startMicrophone(), true); browser.stop();
        assert.equal(timers.size, 0);

        // The tester's exact failure: no WebKit getUserMedia API. Native PCM must
        // reach the existing input filter/analyser at its original sample rate.
        navigator.mediaDevices = undefined;
        const samples = new Float32Array([0.25, -0.5, 0.75, 0]);
        const encoded = Buffer.from(samples.buffer).toString('base64');
        const actions = [], buffers = [], sources = [], events = [];
        let read = async () => ({ samples: encoded, sampleRate: 44100 });
        window.dispatchEvent = event => events.push(event);
        window.webkit = { messageHandlers: {
            microphonePermission: { postMessage: async () => true },
            microphoneCapture: { postMessage: async request => {
                actions.push(request); return request.action === 'read' ? read() : true;
            } }
        } };
        const nativeInput = () => {
            const voice = input(RevPersonalVoiceInput); voice.initAudio();
            Object.assign(voice.context, { state: 'running', currentTime: 2,
                createBuffer(channels, length, rate) {
                    assert.equal(channels, 1);
                    const buffer = { duration: length / rate, rate, copyToChannel(data) { this.samples = Array.from(data); } };
                    buffers.push(buffer); return buffer;
                },
                createBufferSource() {
                    const source = { connect(target) { assert.equal(target, voice.inputFilter); }, disconnect() {},
                        start(time) { assert(time >= 2); }, stop() { this.stopped = true; } };
                    sources.push(source); return source;
                }
            });
            return voice;
        };
        const native = nativeInput(); assert.equal(await native.startMicrophone(), true); await flush();
        assert.equal(native.mode, 'mic'); assert.equal(buffers.at(-1).rate, 44100);
        assert.deepEqual(buffers.at(-1).samples, Array.from(samples));
        assert.equal(actions.find(a => a.action === 'start').echoCancellation, true);
        native.stop(); await flush(); assert(sources.at(-1).stopped);
        assert(actions.some(a => a.action === 'stop')); assert.equal(timers.size, 0);

        // A native read finishing after Stop cannot reconnect audio or restart polling.
        const nativeRead = deferred(); read = () => nativeRead.promise;
        const staleNative = nativeInput(); await staleNative.startMicrophone(); staleNative.stop();
        const count = buffers.length; nativeRead.resolve({ samples: encoded, sampleRate: 48000 }); await flush();
        assert.equal(buffers.length, count); assert.equal(timers.size, 0);

        // Native capture interruptions are surfaced and release the input.
        read = async () => { throw Error('Native input device disconnected'); };
        const disconnected = nativeInput(); await disconnected.startMicrophone(); await flush();
        assert.equal(disconnected.mode, 'none'); assert.equal(disconnected.nativeCapture, null);
        assert.equal(events.at(-1).type, 'revline:microphone-error');
        assert.match(events.at(-1).detail.message, /device disconnected/);
        assert.equal(timers.size, 0);

        delete window.webkit;
        await assert.rejects(input().startMicrophone(), { name: 'NotSupportedError' });
    } finally {
        for (const [key, descriptor] of Object.entries(original)) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
        }
    }

    const failed = ui(), pending = deferred(); let attempts = 0;
    failed.state.voiceInput.startMicrophone = () => { attempts++; return pending.promise; };
    const opening = failed.state.useMicrophone();
    assert(failed.button.disabled); assert.equal(failed.button.attributes['aria-busy'], 'true');
    assert.match(failed.lobbyStatus.textContent, /Opening microphone/);
    await failed.state.useMicrophone(); assert.equal(attempts, 1, 'Duplicate presses never open a second prompt');
    pending.reject(new DOMException('macOS denied audio capture', 'NotAllowedError')); await opening;
    assert.match(failed.status.textContent, /macOS denied audio capture/);
    assert.equal(failed.lobbyStatus.textContent, failed.status.textContent);
    assert.equal(failed.state.hides, 0); assert.equal(failed.state.profiles, 0); assert.equal(failed.button.disabled, false);
    failed.state.startLoop(); assert.equal(failed.state.hides, 0, 'No input cannot enter the race');

    failed.state.voiceInput.startMicrophone = async () => { failed.state.voiceInput.mode = 'mic'; return true; };
    await failed.state.useMicrophone();
    assert.equal(failed.state.hides, 1); assert.equal(failed.state.profiles, 1); assert.equal(failed.state.frames, 1);
    assert.match(failed.status.textContent, /Microphone on/);
    console.log('Microphone startup: native/browser permission, echo constraints, failure/retry, timeout cleanup, stale results, duplicate presses and race gating passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
