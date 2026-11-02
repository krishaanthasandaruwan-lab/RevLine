import GameKit
import UIKit
import WebKit

/// Game Center for the web game (frontend/shared/net.js). JavaScript posts
/// `{ id, cmd, args }` to the "gameCenter" handler; answers go back through
/// `revNetNative.reply(id, ok, data)` and live events through `revNetNative.event(name, data)`.
/// The GKMatch lives here, so a lobby survives page changes (lobby → race → lobby).
final class RevGameCenter: NSObject, GKMatchDelegate, GKLocalPlayerListener, GKGameCenterControllerDelegate {
    weak var webView: WKWebView?
    weak var presenter: UIViewController?
    private var match: GKMatch?
    private var request: GKMatchRequest?
    private var group = 0
    private var locked = false
    private var findCall: Int?
    private var players: [String: GKPlayer] = [:]
    private var authWaiters: [Int] = []
    private var authStarted = false

    // MARK: - JavaScript bridge
    func handle(_ body: [String: Any]) {
        guard let id = body["id"] as? Int, let cmd = body["cmd"] as? String else { return }
        let args = body["args"] as? [String: Any] ?? [:]
        switch cmd {
        case "auth": auth(id)
        case "state": reply(id, true, match.map { ["group": group, "players": playerList($0)] } ?? NSNull())
        case "find": find(id, group: args["group"] as? Int ?? 1, max: args["max"] as? Int ?? 4, recipients: [])
        case "invite":
            let ids = args["ids"] as? [String] ?? []
            invite(id, group: args["group"] as? Int ?? 1, max: args["max"] as? Int ?? 4, recipients: ids.compactMap { players[$0] })
        case "lock": lock(); reply(id, true, true)
        case "cancel": GKMatchmaker.shared().cancel(); reply(id, true, true)
        case "leave": leave(); reply(id, true, true)
        case "send": send(id, payload: args["payload"] as? String ?? "", reliable: args["reliable"] as? Bool ?? true)
        case "activity":
            GKMatchmaker.shared().queryPlayerGroupActivity(1) { count, _ in self.reply(id, true, count) }
        case "friends": friends(id)
        case "addFriend":
            guard let presenter else { reply(id, false, ["error": "Not ready"]); return }
            do { try GKLocalPlayer.local.presentFriendRequestCreator(from: presenter); reply(id, true, true) }
            catch { reply(id, false, ["error": error.localizedDescription]) }
        case "photo": photo(id, playerID: args["id"] as? String ?? "")
        case "submit": submit(id, board: args["board"] as? String ?? "", score: args["score"] as? Int ?? 0)
        case "leaderboard": leaderboard(id, board: args["board"] as? String ?? "", friends: (args["scope"] as? String) == "friends")
        case "dashboard":
            let controller = GKGameCenterViewController(state: .leaderboards)
            controller.gameCenterDelegate = self
            presenter?.present(controller, animated: true)
            reply(id, true, true)
        case "share":
            let text = [args["text"] as? String, args["url"] as? String].compactMap { $0 }.joined(separator: " ")
            let sheet = UIActivityViewController(activityItems: [text], applicationActivities: nil)
            sheet.popoverPresentationController?.sourceView = presenter?.view
            presenter?.present(sheet, animated: true)
            reply(id, true, true)
        default: reply(id, false, ["error": "Unknown command \(cmd)"])
        }
    }

    private func json(_ value: Any) -> String {
        guard JSONSerialization.isValidJSONObject(["v": value]),
              let data = try? JSONSerialization.data(withJSONObject: ["v": value]),
              let text = String(data: data, encoding: .utf8) else { return "null" }
        return "(\(text)).v"
    }
    func reply(_ id: Int, _ ok: Bool, _ data: Any) {
        let script = "window.revNetNative && revNetNative.reply(\(id), \(ok), \(json(data)))"
        DispatchQueue.main.async { self.webView?.evaluateJavaScript(script, completionHandler: nil) }
    }
    func event(_ name: String, _ data: Any) {
        let script = "window.revNetNative && revNetNative.event(\(json(name)), \(json(data)))"
        DispatchQueue.main.async { self.webView?.evaluateJavaScript(script, completionHandler: nil) }
    }
    private func playerList(_ match: GKMatch) -> [[String: String]] {
        match.players.map { players[$0.gamePlayerID] = $0; return ["id": $0.gamePlayerID, "name": $0.displayName] }
    }

    // MARK: - Sign in
    private func auth(_ id: Int) {
        let local = GKLocalPlayer.local
        if local.isAuthenticated { reply(id, true, ["id": local.gamePlayerID, "name": local.displayName]); return }
        authWaiters.append(id)
        guard !authStarted else { return }
        authStarted = true
        local.authenticateHandler = { [weak self] controller, error in
            guard let self else { return }
            if let controller { self.presenter?.present(controller, animated: true); return }
            let waiters = self.authWaiters; self.authWaiters = []
            if local.isAuthenticated {
                local.register(self)
                for waiter in waiters { self.reply(waiter, true, ["id": local.gamePlayerID, "name": local.displayName]) }
            } else {
                self.authStarted = false
                let message = error?.localizedDescription ?? "Sign in to Game Center in Settings"
                for waiter in waiters { self.reply(waiter, false, ["error": message]) }
            }
        }
    }

    // MARK: - Matches (friends code = player group; online = group 1)
    private func makeRequest(group: Int, max: Int, recipients: [GKPlayer]) -> GKMatchRequest {
        let request = GKMatchRequest()
        request.minPlayers = 2
        request.maxPlayers = Swift.max(2, Swift.min(4, max))
        request.playerGroup = group
        if !recipients.isEmpty {
            request.recipients = recipients
            request.recipientResponseHandler = { [weak self] player, response in
                self?.event("status", ["text": response == .accepted ? "\(player.displayName) accepted" : "\(player.displayName) can't join right now"])
            }
        }
        return request
    }
    private func find(_ id: Int, group: Int, max: Int, recipients: [GKPlayer]) {
        leave()
        self.group = group
        let request = makeRequest(group: group, max: max, recipients: recipients)
        self.request = request
        findCall = id
        GKMatchmaker.shared().findMatch(for: request) { [weak self] match, error in
            guard let self else { return }
            let call = self.findCall; self.findCall = nil
            guard let match else {
                if let call { self.reply(call, true, NSNull()) }   // cancelled or failed: JS treats null as "no match"
                if let error, (error as? GKError)?.code != .cancelled { self.event("status", ["text": error.localizedDescription]) }
                return
            }
            self.adopt(match)
            if let call { self.reply(call, true, ["group": group, "players": self.playerList(match)]) }
        }
    }
    private func invite(_ id: Int, group: Int, max: Int, recipients: [GKPlayer]) {
        guard !recipients.isEmpty else { reply(id, false, ["error": "Choose a friend to invite"]); return }
        if let match, let request {
            // Already in a lobby: invite the friends into this match.
            let invite = makeRequest(group: request.playerGroup, max: request.maxPlayers, recipients: recipients)
            GKMatchmaker.shared().addPlayers(to: match, matchRequest: invite) { [weak self] error in
                if let error { self?.event("status", ["text": error.localizedDescription]) }
                if let self, let match = self.match { self.event("players", self.playerList(match)) }
            }
            reply(id, true, true)
        } else {
            // Still waiting alone: search again with the friends invited.
            GKMatchmaker.shared().cancel()
            find(id, group: group, max: max, recipients: recipients)
        }
    }
    private func adopt(_ match: GKMatch) {
        self.match = match
        match.delegate = self
        locked = false
        event("players", playerList(match))
        fill()
    }
    // Keep the lobby open for more players (up to 4) until the race starts.
    private func fill() {
        guard let match, let request, !locked, match.players.count < request.maxPlayers - 1 else { return }
        GKMatchmaker.shared().addPlayers(to: match, matchRequest: request) { [weak self] error in
            guard let self, self.match === match else { return }
            if error == nil { self.event("players", self.playerList(match)) }
            DispatchQueue.main.asyncAfter(deadline: .now() + (error == nil ? 0.5 : 3)) { self.fill() }
        }
    }
    private func lock() {
        locked = true
        if let match { GKMatchmaker.shared().finishMatchmaking(for: match) }
    }
    private func leave() {
        GKMatchmaker.shared().cancel()
        match?.disconnect()
        match?.delegate = nil
        match = nil
        locked = false
    }
    private func send(_ id: Int, payload: String, reliable: Bool) {
        guard let match, let data = payload.data(using: .utf8), data.count <= 80_000 else { reply(id, false, ["error": "Not in a match"]); return }
        do { try match.sendData(toAllPlayers: data, with: reliable ? .reliable : .unreliable); reply(id, true, true) }
        catch { reply(id, false, ["error": error.localizedDescription]) }
    }

    // MARK: - GKMatchDelegate
    func match(_ match: GKMatch, didReceive data: Data, fromRemotePlayer player: GKPlayer) {
        guard match === self.match, let payload = String(data: data, encoding: .utf8) else { return }
        event("data", ["from": player.gamePlayerID, "payload": payload])
    }
    func match(_ match: GKMatch, player: GKPlayer, didChange state: GKPlayerConnectionState) {
        guard match === self.match else { return }
        event("players", playerList(match))
        if state == .disconnected { event("disconnected", ["id": player.gamePlayerID]) }
    }
    func match(_ match: GKMatch, didFailWithError error: Error?) {
        event("status", ["text": error?.localizedDescription ?? "The match ended"])
    }

    // MARK: - Invitations (GKLocalPlayerListener)
    func player(_ player: GKPlayer, didAccept invite: GKInvite) {
        GKMatchmaker.shared().match(for: invite) { [weak self] match, error in
            guard let self, let match else { if let error { self?.event("status", ["text": error.localizedDescription]) }; return }
            self.leave()
            self.group = invite.playerGroup
            self.request = self.makeRequest(group: invite.playerGroup, max: 4, recipients: [])
            self.adopt(match)
            // Open the multiplayer lobby page, wherever the player was in the app.
            self.event("matched", ["group": invite.playerGroup, "players": self.playerList(match)])
            DispatchQueue.main.async { (self.presenter as? RevLineController)?.openPage("frontend/multiplayer/index.html?invited=1") }
        }
    }

    // MARK: - Friends, photos, leaderboards
    private func friends(_ id: Int) {
        GKLocalPlayer.local.loadFriendsAuthorizationStatus { status, _ in
            if status == .denied || status == .restricted {
                self.reply(id, false, ["error": "Allow RevLine to see your friends in Settings → Game Center → Friends List."]); return
            }
            GKLocalPlayer.local.loadFriends { friends, error in
                if let error { self.reply(id, false, ["error": error.localizedDescription]); return }
                let list = (friends ?? []).map { friend -> [String: String] in
                    self.players[friend.gamePlayerID] = friend
                    return ["id": friend.gamePlayerID, "name": friend.displayName]
                }
                self.reply(id, true, list)
            }
        }
    }
    private func photo(_ id: Int, playerID: String) {
        let player: GKPlayer? = playerID == GKLocalPlayer.local.gamePlayerID ? GKLocalPlayer.local : players[playerID]
        guard let player else { reply(id, true, ""); return }
        player.loadPhoto(for: .normal) { image, _ in
            guard let data = image?.pngData() else { self.reply(id, true, ""); return }
            self.reply(id, true, "data:image/png;base64," + data.base64EncodedString())
        }
    }
    private func submit(_ id: Int, board: String, score: Int) {
        guard GKLocalPlayer.local.isAuthenticated, !board.isEmpty else { reply(id, true, false); return }
        GKLeaderboard.submitScore(score, context: 0, player: GKLocalPlayer.local, leaderboardIDs: [board]) { error in
            self.reply(id, true, error == nil)
        }
    }
    private func leaderboard(_ id: Int, board: String, friends: Bool) {
        GKLeaderboard.loadLeaderboards(IDs: [board]) { boards, error in
            guard let leaderboard = boards?.first else {
                self.reply(id, false, ["error": error?.localizedDescription ?? "Leaderboard \(board) is not set up in App Store Connect yet."]); return
            }
            leaderboard.loadEntries(for: friends ? .friendsOnly : .global, timeScope: .allTime, range: NSRange(location: 1, length: 50)) { local, entries, _, error in
                if let error { self.reply(id, false, ["error": error.localizedDescription]); return }
                let list = (entries ?? []).map { entry -> [String: Any] in
                    self.players[entry.player.gamePlayerID] = entry.player
                    return ["rank": entry.rank, "id": entry.player.gamePlayerID, "name": entry.player.displayName, "score": entry.score]
                }
                self.reply(id, true, ["entries": list, "local": local.map { $0.rank } ?? NSNull()])
            }
        }
    }
    func gameCenterViewControllerDidFinish(_ controller: GKGameCenterViewController) { controller.dismiss(animated: true) }
}
