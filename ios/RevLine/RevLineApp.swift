import SwiftUI

@main
struct RevLineApp: App {
    var body: some Scene {
        WindowGroup {
            RevLineScreen().preferredColorScheme(.dark)
                // Invite links: revline://join/123456
                .onOpenURL { url in RevLineController.current?.open(url) }
        }
    }
}

struct RevLineScreen: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> RevLineController { RevLineController() }
    func updateUIViewController(_ controller: RevLineController, context: Context) {}
}
