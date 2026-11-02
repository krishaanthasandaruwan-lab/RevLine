# RevLine multiplayer, profiles and leaderboards

Multiplayer runs on **Apple Game Center** for now. The game code talks to one network layer
(`frontend/shared/net.js`), so a Firebase backend can be added later without rewriting the
screens.

## What players get

- **Profile** (Home → your name chip, or Multiplayer → chip): photo (your own, your Game
  Center photo, or a colour with your initial), name, country with flag, bio (150
  characters), and stats (races, wins, podiums, best time, career stars and points).
- **Race with friends:** *Create a lobby* gives a 6-digit code. *Share link* opens the share
  sheet (WhatsApp, Messages and others). *Copy link* and *Copy code* also work, and *Invite
  friends* sends a Game Center invite. Up to 4 players. The host chooses the race (any career
  round from the 20 regions, or a custom road: distance, bends, surface, traffic) and the AI
  level, then starts once everyone is ready. *Next round* keeps the same settings.
- **Online race:** finds players searching right now (2–4). The track is chosen
  automatically, and the race starts on its own after a few seconds (at once with 4 players).
- **In the race,** other players' real cars race alongside you, positions update 10 times a
  second, and everyone counts down together. Other players' cars never collide with yours
  (the network delay would make crashes unfair). Empty grid places are AI cars. Results
  show every player's place, time, flag and picture, and the winner earns coins and a win.
- **Leaderboard:** Wins, Career stars and Career points, both global and friends, plus a
  button that opens the Game Center leaderboards.
- **Join links:** `revline://join/123456` opens the app straight in that lobby. Shared
  messages also contain the code, because WhatsApp doesn't make app links tappable. With
  Firebase later this becomes a normal `https://` link.

## One-time setup in App Store Connect (needed before Game Center works)

Game Center only signs players in for an app that App Store Connect knows. Until this is
done, the Multiplayer screen shows "Game Center is not available".

1. **App Store Connect → Apps → +** → New App. Platform iOS, name *RevLine*, bundle ID
   `com.krishansandaruwan.revline` (team HYKLC6A296; it is already registered by Xcode). Skip
   this step if the app exists.
2. In the app: **Features → Game Center → enable** (or *Services → Game Center* in newer
   layouts).
3. Add **3 leaderboards** (*Classic*, *High score*, *Integer*, *Best score*). Use exactly
   these IDs:

   | Reference name | Leaderboard ID | Score |
   |---|---|---|
   | Multiplayer wins | `revline.wins` | Total multiplayer wins |
   | Career stars | `revline.stars` | Total career stars |
   | Career points | `revline.points` | Total career points |

   Give each an English display name (e.g. "Wins") and a score format suffix.
4. On the iPhone: **Settings → Game Center** → signed in. For testing before release,
   Game Center uses the sandbox automatically for Xcode builds.
5. Friends lists: the first time *Friends* opens, iOS asks to share the friends list. If
   it was denied: **Settings → Game Center → Friends List → RevLine**.

**Never delete or rename these leaderboard IDs.** Scores live on Apple's servers under
them, and deleting one deletes its scores.

## Testing without phones (any browser)

Outside the iPhone app, `net.js` uses a simulator: each browser tab is a player and tabs
find each other through `BroadcastChannel`. Open `frontend/multiplayer/index.html` in two
or more tabs (or windows): create a lobby in one, join with its code in another, or press
*Online race* in both. The simulator's leaderboard is stored in that browser only.
Automated checks: `tests/multiplayer.test.cjs` (protocol), plus the two-window browser run
described in the AGENTS notes.

## Upgrading to Firebase later (no data loss)

- **Game Center scores** stay on Apple's servers. Keep showing them, or copy them into
  Firebase once.
- **Profiles, stats, career progress, coins and cars** are stored on each phone
  (`revline-profile-v1`, `revline-career-v1`, `revline-garage-v1`). A Firebase build uploads
  them on first sign-in, and nothing on the phone is deleted.
- **Identity:** Firebase Authentication can sign in with Game Center, so the same players
  keep the same account. `profile.state.gameCenterId` is stored for that link.
- **What changes:** add a `RevFirebaseTransport` with the same methods as the Game Center
  transport in `net.js` (find, send, friends, leaderboard and so on). The pages, lobby
  protocol and race code stay as they are. Firebase Hosting then provides `https://` invite
  links that open the app (Universal Links), and full leaderboards with countries, bios
  and photos.

## Files

| File | Role |
|---|---|
| `frontend/shared/profile-store.js` | Profile, country list, avatars, remembered players |
| `frontend/shared/net.js` | Network layer: Game Center bridge and the browser simulator |
| `frontend/shared/lobby.js` | Lobby and race protocol (host, settings, ready, start, GO, positions, results) |
| `frontend/multiplayer/` | Multiplayer screen: online, friends lobby, friends, leaderboard |
| `frontend/profile/` | Profile editor |
| `frontend/race/mp-race.js` | Race page in multiplayer (`?mp=1`): course, remote cars, shared GO and results |
| `ios/RevLine/RevGameCenter.swift` | GameKit: sign-in, matches, invites, friends, photos, leaderboards, share sheet |
| `ios/RevLine/RevLine.entitlements` | Game Center capability |
