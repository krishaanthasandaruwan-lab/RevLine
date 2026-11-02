import Foundation

@main
struct LocalServerCheck {
    static func main() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        try Data("0123456789".utf8).write(to: root.appendingPathComponent("index.html"))
        try Data("body { color: white; }".utf8).write(to: root.appendingPathComponent("game.css"))
        let server = LoopbackServer(root: root)
        func response(_ request: String) -> String { String(decoding: server.response(for: Data(request.utf8)), as: UTF8.self) }
        let full = response("GET /index.html HTTP/1.1\r\n\r\n")
        precondition(full.hasPrefix("HTTP/1.1 200") && full.hasSuffix("0123456789"))
        let stylesheet = response("GET /game.css HTTP/1.1\r\n\r\n")
        precondition(stylesheet.contains("Content-Type: text/css; charset=utf-8") && stylesheet.hasSuffix("body { color: white; }"))
        let head = response("HEAD / HTTP/1.1\r\n\r\n")
        precondition(head.contains("Content-Length: 10") && head.hasSuffix("\r\n\r\n"))
        let range = response("GET / HTTP/1.1\r\nRange: bytes=2-5\r\n\r\n")
        precondition(range.hasPrefix("HTTP/1.1 206") && range.contains("Content-Range: bytes 2-5/10") && range.hasSuffix("2345"))
        precondition(response("GET / HTTP/1.1\r\nRange: bytes=-3\r\n\r\n").hasSuffix("789"))
        precondition(response("GET / HTTP/1.1\r\nRange: bytes=9-\r\n\r\n").hasSuffix("9"))
        for range in ["bytes=100-", "bytes=-0", "bytes=5-2", "bytes=0-1,4-5", "bytes=x-y"] {
            precondition(response("GET / HTTP/1.1\r\nRange: \(range)\r\n\r\n").hasPrefix("HTTP/1.1 416"))
        }
        for path in ["/../outside", "/%2e%2e/outside", "/%00"] {
            precondition(response("GET \(path) HTTP/1.1\r\n\r\n").hasPrefix("HTTP/1.1 403"))
        }
        let outside = root.deletingLastPathComponent().appendingPathComponent(UUID().uuidString + ".txt")
        try Data("outside bundle".utf8).write(to: outside)
        defer { try? FileManager.default.removeItem(at: outside) }
        try FileManager.default.createSymbolicLink(at: root.appendingPathComponent("escape"), withDestinationURL: outside)
        precondition(response("GET /escape HTTP/1.1\r\n\r\n").hasPrefix("HTTP/1.1 403"))
        precondition(response("POST / HTTP/1.1\r\n\r\n").hasPrefix("HTTP/1.1 405"))
        precondition(response("GET /missing HTTP/1.1\r\n\r\n").hasPrefix("HTTP/1.1 404"))
        print("iOS local server checks passed: assets, HEAD, media ranges and bundle boundary.")
    }
}
