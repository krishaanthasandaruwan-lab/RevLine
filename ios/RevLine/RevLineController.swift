import UIKit
import WebKit
import AVFAudio

final class RevLineController: UIViewController, WKUIDelegate, WKNavigationDelegate, WKScriptMessageHandler, WKScriptMessageHandlerWithReply, UIScrollViewDelegate {
    private var server: LoopbackServer?
    private var origin: URL?
    private var webView: WKWebView!
    /// Game Center for multiplayer, profiles and leaderboards (RevGameCenter.swift).
    let gameCenter = RevGameCenter()
    /// The visible controller, for links that open the app (revline://join/123456).
    static weak var current: RevLineController?
    private var pendingPage: String?
    private let errorLabel = UILabel()
    private var microphoneEngine: AVAudioEngine?
    private var pendingMicrophoneID: String?
    private let microphoneLock = NSLock()
    private var microphoneCaptureID: String?
    private var microphoneSamples = Data()
    private var microphoneSampleRate = 0.0

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.addUserScript(WKUserScript(source: "window.REVLINE_IOS = true;", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController.add(self, name: "exportRun")
        config.userContentController.add(self, name: "gameCenter")
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "microphonePermission")
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "microphoneCapture")
        webView = WKWebView(frame: .zero, configuration: config)
        webView.uiDelegate = self
        gameCenter.webView = webView
        gameCenter.presenter = self
        RevLineController.current = self
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        // The game never zooms: no pinch, no double-tap zoom.
        webView.scrollView.delegate = self
        webView.scrollView.minimumZoomScale = 1
        webView.scrollView.maximumZoomScale = 1
        webView.scrollView.bouncesZoom = false
        webView.scrollView.pinchGestureRecognizer?.isEnabled = false
        #if DEBUG
        webView.isInspectable = true
        #endif
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor), webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor), webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])
        errorLabel.textColor = .white; errorLabel.numberOfLines = 0; errorLabel.textAlignment = .center
        errorLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(errorLabel)
        NSLayoutConstraint.activate([errorLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor), errorLabel.centerYAnchor.constraint(equalTo: view.centerYAnchor), errorLabel.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, multiplier: 0.85)])
        NotificationCenter.default.addObserver(self, selector: #selector(suspendAudio), name: UIApplication.didEnterBackgroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(suspendAudio), name: UIScene.didDisconnectNotification, object: nil)
        startLocalApp()
    }

    private func startLocalApp() {
        guard let root = Bundle.main.resourceURL?.appendingPathComponent("Web") else { return }
        let server = LoopbackServer(root: root)
        self.server = server
        do {
            try server.start { [weak self] result in
                DispatchQueue.main.async {
                    guard let self else { return }
                    switch result {
                    case .success(let url):
                        self.origin = url
                        // The new frontend is the start page; the DEBUG self-check still inspects the original root page.
                        let selfTest = ProcessInfo.processInfo.arguments.contains("--revline-self-test")
                        let start = selfTest ? url : URL(string: self.pendingPage ?? "frontend/index.html", relativeTo: url)!.absoluteURL
                        self.pendingPage = nil
                        self.webView.load(URLRequest(url: start))
                    case .failure(let error): self.errorLabel.text = "RevLine could not load. Reopen the app.\n\(error.localizedDescription)"
                    }
                }
            }
        } catch { errorLabel.text = "RevLine could not load. Reopen the app.\n\(error.localizedDescription)" }
    }

    private func isLocal(_ url: URL?) -> Bool {
        url?.scheme == "http" && url?.host == "127.0.0.1" && url?.port == origin?.port
    }

    func viewForZooming(in scrollView: UIScrollView) -> UIView? { nil }
    func scrollViewWillBeginZooming(_ scrollView: UIScrollView, with view: UIView?) { scrollView.pinchGestureRecognizer?.isEnabled = false }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(isLocal(navigationAction.request.url) ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor securityOrigin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        guard type == .microphone, frame.isMainFrame, securityOrigin.host == "127.0.0.1", securityOrigin.port == origin?.port else { decisionHandler(.deny); return }
        requestMicrophonePermission { decisionHandler($0 ? .grant : .deny) }
    }

    private func requestMicrophonePermission(_ completion: @escaping (Bool) -> Void) {
        AVAudioApplication.requestRecordPermission { allowed in
            DispatchQueue.main.async {
                if allowed { self.preferSpeaker() }
                completion(allowed)
            }
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard ["microphonePermission", "microphoneCapture"].contains(message.name), message.frameInfo.isMainFrame, isLocal(message.frameInfo.request.url) else {
            replyHandler(nil, "Microphone requests are limited to the app's own main page.")
            return
        }
        if message.name == "microphonePermission" {
            requestMicrophonePermission { replyHandler($0, nil) }
            return
        }
        guard let body = message.body as? [String: Any], let action = body["action"] as? String,
              let id = body["id"] as? String, !id.isEmpty, id.count <= 100 else {
            replyHandler(nil, "Invalid microphone request."); return
        }
        switch action {
        case "start":
            pendingMicrophoneID = id
            requestMicrophonePermission { allowed in
                guard self.pendingMicrophoneID == id else { replyHandler(nil, "Microphone startup was cancelled."); return }
                guard allowed else { replyHandler(nil, "Microphone permission was denied."); return }
                guard UIApplication.shared.applicationState == .active else { replyHandler(nil, "Return to RevLine and try Microphone again."); return }
                do {
                    try self.startNativeMicrophone(id: id, echoCancellation: body["echoCancellation"] as? Bool ?? true)
                    replyHandler(true, nil)
                } catch { replyHandler(nil, "Native microphone could not start: \(error.localizedDescription)") }
            }
        case "read":
            microphoneLock.lock()
            let valid = microphoneCaptureID == id
            let samples = microphoneSamples
            let sampleRate = microphoneSampleRate
            if valid { microphoneSamples.removeAll(keepingCapacity: true) }
            microphoneLock.unlock()
            guard valid, microphoneEngine?.isRunning == true else { replyHandler(nil, "Microphone capture stopped. Try Microphone again."); return }
            replyHandler(["samples": samples.base64EncodedString(), "sampleRate": sampleRate], nil)
        case "stop":
            if pendingMicrophoneID == id { pendingMicrophoneID = nil }
            microphoneLock.lock(); let current = microphoneCaptureID == id; microphoneLock.unlock()
            if current { stopNativeMicrophone() }
            replyHandler(true, nil)
        default: replyHandler(nil, "Unknown microphone action.")
        }
    }

    // Some iPhone-on-Mac WebKit windows do not expose getUserMedia. Keep capture native
    // there and send only a bounded, transient PCM window to the same web analyser.
    private func startNativeMicrophone(id: String, echoCancellation: Bool) throws {
        stopNativeMicrophone()
        let engine = AVAudioEngine()
        let input = engine.inputNode
        if echoCancellation {
            try input.setVoiceProcessingEnabled(true)
            input.isVoiceProcessingAGCEnabled = false
        }
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0, format.channelCount <= 32,
              format.commonFormat == .pcmFormatFloat32 else {
            throw NSError(domain: "RevLineMicrophone", code: 1, userInfo: [NSLocalizedDescriptionKey: "No compatible microphone input is available."])
        }
        microphoneLock.lock()
        microphoneCaptureID = id; microphoneSampleRate = format.sampleRate
        microphoneLock.unlock()
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            guard let self, let channels = buffer.floatChannelData else { return }
            let count = Int(buffer.frameLength), channelCount = Int(buffer.format.channelCount)
            var mono = [Float](repeating: 0, count: count)
            for frame in 0..<count {
                for channel in 0..<channelCount {
                    mono[frame] += buffer.format.isInterleaved ? channels[0][frame * channelCount + channel] : channels[channel][frame]
                }
                mono[frame] /= Float(channelCount)
            }
            self.microphoneLock.lock()
            if self.microphoneCaptureID == id {
                mono.withUnsafeBytes { self.microphoneSamples.append(contentsOf: $0) }
                // Match the analyser's 8192-sample window; never accumulate a recording.
                let excess = self.microphoneSamples.count - 8192 * MemoryLayout<Float>.size
                if excess > 0 { self.microphoneSamples.removeFirst(excess) }
            }
            self.microphoneLock.unlock()
        }
        microphoneEngine = engine
        do { engine.prepare(); try engine.start() }
        catch { stopNativeMicrophone(); throw error }
    }

    private func stopNativeMicrophone() {
        pendingMicrophoneID = nil
        microphoneLock.lock()
        microphoneCaptureID = nil; microphoneSamples.removeAll(keepingCapacity: false)
        microphoneLock.unlock()
        if let engine = microphoneEngine { engine.inputNode.removeTap(onBus: 0); engine.stop() }
        microphoneEngine = nil
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        stopNativeMicrophone()
    }

    // Race sound effects should play from the loudspeaker while the microphone listens
    // (best effort: WebKit manages capture and may adjust the session itself).
    private func preferSpeaker() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothA2DP])
        try? session.setActive(true)
    }

    @objc private func suspendAudio() {
        stopNativeMicrophone()
        webView.evaluateJavaScript("window.revlineSuspendForBackground?.()", completionHandler: nil)
        webView.setMicrophoneCaptureState(.none, completionHandler: nil)
    }

    /// Opens a page of the bundled web app (or remembers it until the local server is up).
    func openPage(_ path: String) {
        guard let origin, let url = URL(string: path, relativeTo: origin)?.absoluteURL else { pendingPage = path; return }
        webView.load(URLRequest(url: url))
    }
    /// revline://join/123456 → the multiplayer lobby with that code.
    func open(_ url: URL) {
        guard url.scheme == "revline" else { return }
        let parts = ([url.host] + url.pathComponents).compactMap { $0 }.filter { $0 != "/" }
        if parts.first == "join", let code = parts.dropFirst().first?.filter(\.isNumber), code.count == 6 {
            openPage("frontend/multiplayer/index.html?join=\(code)")
        } else {
            openPage("frontend/multiplayer/index.html")
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "gameCenter" {
            guard message.frameInfo.isMainFrame, isLocal(message.frameInfo.request.url), let body = message.body as? [String: Any] else { return }
            gameCenter.handle(body)
            return
        }
        guard message.name == "exportRun", message.frameInfo.isMainFrame, isLocal(message.frameInfo.request.url),
              let csv = message.body as? String, csv.utf8.count <= 5_000_000 else { return }
        do {
            let file = FileManager.default.temporaryDirectory.appendingPathComponent("revline-sound-test-\(UUID().uuidString).csv")
            try csv.write(to: file, atomically: true, encoding: .utf8)
            let share = UIActivityViewController(activityItems: [file], applicationActivities: nil)
            share.popoverPresentationController?.sourceView = view
            present(share, animated: true)
        } catch { webView.evaluateJavaScript("setStatus('CSV export failed. Try again.', true)", completionHandler: nil) }
    }

    #if DEBUG
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard ProcessInfo.processInfo.arguments.contains("--revline-self-test") else { return }
        let check = """
        (async () => {
          const setupAvailable = typeof voiceSetup !== 'undefined';
          if (setupAvailable && voiceSetup.dialog.open) voiceSetup.close(false);
          const result = { secure: isSecureContext, microphoneAPI: !!navigator.mediaDevices?.getUserMedia,
            nativeLayout: document.body.classList.contains('ios-app'), speedometer: !!document.getElementById('speedoCanvas'),
            settings: !!document.getElementById('settings-dialog'), courseToggles: document.querySelectorAll('.course-options input[role=switch]').length,
            raceDefaultMeters: raceLength, simpleScene: typeof revDrawFpv === 'undefined' && typeof RevRoadEvents === 'undefined' && !document.getElementById('events-enabled'),
            simpleControls: !!document.getElementById('voice-meter') && !document.getElementById('virtual-accel-btn'),
            difficultyModes: document.getElementById('difficulty').options.length, garage: !!document.getElementById('garage') && garage.power >= 1,
            home: gameMenuOpen && !!document.getElementById('game-menu'), freeStore: REV_CARS.length === 8 && REV_SHOP.car.every(c => c.price === 0),
            generatedEngineAudioRemoved: !document.getElementById('synth-slider'),
            voiceModule: voiceInput instanceof RevVoiceInput && voiceInput.ai === voiceAI && voiceInput.profile === 'voice',
            voiceSetupAvailable: setupAvailable && !!document.getElementById('home-voice-setup') && !!document.getElementById('open-voice-setup') };
          result.stableOrigin = localStorage.getItem('revline-origin-check') === 'ready';
          localStorage.setItem('revline-origin-check', 'ready');
          try {
            await voiceAI.load(); result.ai = voiceAI.state;
            const calibration = new RevVoiceCalibration();
            for (let i = 0; i < 60; i++) calibration.observe('quiet', {activityRms:.001}, .05);
            for (let i = 0; i < 100; i++) calibration.observe('rev', {activityRms:.04, pitchHz:100+i*1.4, pitchSource:'AI voice', confidence:.9}, .05);
            const fitted = calibration.fit().profile;
            const personalInput = new RevPersonalVoiceInput();
            result.personalVoiceCalibration = !!fitted && personalInput.usePersonalProfile({...fitted, practice:{up:2,down:2}})
              && personalInput.calibration.pitchLowHz < 150 && personalInput.gate < .008;
            personalInput.blend.reset();
            result.personalVoiceRange = personalInput.blend.pitchLowHz === personalInput.calibration.pitchLowHz;
            voiceSetup.open();
            result.narrowVoiceSetup = ['welcome','quiet','rev','up','down','ready'].every(step => {
              voiceSetup.step = step; voiceSetup.render();
              return voiceSetup.dialog.scrollWidth <= voiceSetup.dialog.clientWidth
                && document.getElementById('voice-setup-action').getBoundingClientRect().height >= 44;
            });
            voiceSetup.close(false);
            function probeDirection(quietCut, roundedReturn = false, variant = null) {
              const input = new RevVoiceInput(), spectrum = new Float32Array(4096).fill(-120), directions = [];
              let probeGear = 4, last = -10;
              for (let frame = 0; frame < 120; frame++) {
                const t = frame / 60;
                const low = t >= 0.9 && t < (quietCut ? 1 : 1.25);
                let hz = t < 0.2 ? 180 : t < 0.8 ? 180 + (t - 0.2) / 0.6 * 120 : low ? (quietCut ? 210 : 276) : 300;
                let rms = low ? (quietCut ? 0 : 0.085) : 0.1;
                if (roundedReturn) {
                  const curve = [[185, .065], [185, .065], [185, .065], [201, .115], [228, .15],
                    [216, .072], [205, .075], [196, .085], [188, .06]];
                  [hz, rms] = curve[Math.min(curve.length - 1, Math.floor(t * 10))];
                  if (variant === 'old-spike' && t >= .03 && t < .06) hz = 370;
                  if (variant === 'rebound' || variant === 'deep-release') {
                    hz = t < .2 ? 180 : t < .8 ? 180 + (t - .2) / .6 * 120 : 300;
                    rms = .12;
                    if (variant === 'rebound') {
                      if (t >= .85 && t < 1) { hz = 274; rms = .055; }
                      if (t >= 1 && t < 1.15) { hz = 291; rms = .1; }
                      if (t >= 1.15 && t < 1.25) { hz = 260; rms = .045; }
                      if (t >= 1.25) { hz = 240; rms = .09; }
                    } else {
                      if (t >= .85 && t < 1) { hz = 280; rms = .06; }
                      if (t >= 1 && t < 1.15) { hz = 270; rms = .02; }
                      if (t >= 1.15) { hz = 250; rms = .07; }
                    }
                  }
                }
                let signal = { ...input.model.update(spectrum, rms, 48000, 8192, 1 / 60, {
                  profile: 'voice', gate: input.gate, sensitivity: input.sensitivity, voiceCalibration: input.calibration,
                  activityRms: rms, voicePitch: { hz, confidence: 0.9 }
                }), activityRms: rms };
                signal = input.blend.update(signal, 1 / 60, input.gate, input.sensitivity);
                const cue = input.detectShift(signal, signal.press, probeGear, 1 / 60, t - last, { rpm: 8.5 });
                if (cue.direction) {
                  directions.push(cue.direction); probeGear += cue.direction === 'up' ? 1 : -1; last = t;
                  input.cut.reset(); input.downshift.reset();
                }
              }
              return directions.join(',');
            }
            result.softDownshiftGesture = probeDirection(false) === 'down';
            result.upshiftGesturePreserved = probeDirection(true) === 'up';
            result.roundedDownshiftGesture = probeDirection(false, true) === 'down';
            result.spikeResistantDownGesture = probeDirection(false, true, 'old-spike') === 'down';
            result.reboundUpGesture = probeDirection(false, true, 'rebound') === 'up';
            result.deepReleaseUpGesture = probeDirection(false, true, 'deep-release') === 'up';
            const blendToggle = document.getElementById('voice-blend');
            result.voiceBlendDefault = blendToggle.checked && !blendToggle.disabled;
            blendToggle.checked = false; blendToggle.dispatchEvent(new Event('change'));
            result.voicePreviousSwitch = !blendToggle.checked && document.getElementById('test-status').textContent.includes('Previous voice control restored');
            blendToggle.checked = true; blendToggle.dispatchEvent(new Event('change'));
            result.voiceBlendSwitch = blendToggle.checked && document.getElementById('test-status').textContent.includes('trial on');
            const overlay = document.getElementById('overlay'), oldMarkup = overlay.innerHTML;
            const grades = [];
            for (const rpm of [7.5, 8.8, 9.8]) {
              gear = 3; currentRpm = rpm; shiftGearUp();
              grades.push(document.getElementById('gear-alert').dataset.grade);
            }
            result.shiftGrades = grades.join(',') === 'early,perfect,late';
            shiftGearDown(); result.downshiftFeedback = document.getElementById('gear-alert').textContent.includes('▼');
            const engine = new RevDriveFeedback();
            for (let frame = 0; frame < 180; frame++) engine.update(3, 10, 1, true, false, 1 / 60);
            result.threeSecondGrace = !engine.engineFailed;
            engine.update(3, 10, 1, true, false, 1 / 60);
            result.engineFailureTimer = engine.engineFailed;
            showRunEnd(true, 'engine');
            result.engineFailureScreen = overlay.querySelector('h1').textContent === 'Engine blown';
            resetGame(); overlay.innerHTML = oldMarkup; showGameMenu('home', false);
            const stylesheet = await fetch('game.css'); result.stylesheet = stylesheet.ok && stylesheet.headers.get('content-type').startsWith('text/css');
            const decoder = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 48000);
            const decoded = await Promise.all(REV_CARS.map(async car => {
              const response = await fetch('assets/engines/' + car.id + '.m4a');
              if (!response.ok) return false;
              const buffer = await decoder.decodeAudioData(await response.arrayBuffer());
              return buffer.duration > 2.8 && buffer.duration < 3.2;
            }));
            result.enginePreviewsDecoded = decoded.length === 8 && decoded.every(Boolean);
            setMenuView('store', false);
            const menu = document.getElementById('game-menu');
            result.narrowStore = menu.scrollWidth <= menu.clientWidth;
            result.stickyStoreActions = getComputedStyle(document.querySelector('.store-selection')).position === 'sticky';
            setMenuView('garage', false); result.narrowGarage = menu.scrollWidth <= menu.clientWidth;
            setMenuView('home', false); result.narrowHome = menu.scrollWidth <= menu.clientWidth;
            const left = document.querySelector('.left-controls').getBoundingClientRect();
            const right = document.querySelector('.right-controls').getBoundingClientRect();
            result.controlsSeparated = left.right < right.left;
            result.touchTargets = ['btn-left','btn-right','btn-drift-left','btn-drift-right','gear-lcd-circle','btn-brake'].every(id => {
              const r = document.getElementById(id).getBoundingClientRect(); return r.width >= 44 && r.height >= 44;
            });
            const frame = Float32Array.from({length:1024}, (_,i) => Math.sin(i * 2 * Math.PI * 220 / 16000));
            result.pitch = await voiceAI.predictFrame(frame);
            const media = await fetch('assets/rev-voice-3313.m4a', {headers:{Range:'bytes=0-15'}});
            result.mediaRange = media.status === 206 && (await media.arrayBuffer()).byteLength === 16;
          } catch (e) { result.error = String(e); }
          return result;
        })()
        """
        webView.callAsyncJavaScript("return await " + check, arguments: [:], in: nil, in: .page) { result in
            let object: Any
            switch result { case .success(let value): object = value; case .failure(let error): object = ["error": error.localizedDescription] }
            if let data = try? JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted]),
               let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
                try? data.write(to: documents.appendingPathComponent("native-smoke-check.json"))
            }
        }
    }
    #endif
}
