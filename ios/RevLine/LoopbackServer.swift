import Foundation
import Network

// The bundle is served on loopback so Web Audio, microphone capture and local
// model fetches use one trustworthy origin, with no remote hosting dependency.
final class LoopbackServer {
    private let root: URL
    private let queue = DispatchQueue(label: "RevLine.local-assets")
    private var listener: NWListener?
    private var connections: [UUID: NWConnection] = [:]

    init(root: URL) { self.root = root.standardizedFileURL.resolvingSymlinksInPath() }

    func start(completion: @escaping (Result<URL, Error>) -> Void) throws {
        let parameters = NWParameters.tcp
        // Keep the origin stable so WebKit course preferences and race records
        // survive app launches. Only this app's loopback assets are served.
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: 18743)!)
        let listener = try NWListener(using: parameters)
        self.listener = listener
        var reported = false
        listener.stateUpdateHandler = { state in
            switch state {
            case .ready:
                guard !reported, let port = listener.port else { return }
                reported = true
                completion(.success(URL(string: "http://127.0.0.1:\(port.rawValue)/index.html")!))
            case .failed(let error):
                if !reported { reported = true; completion(.failure(error)) }
            default: break
            }
        }
        listener.newConnectionHandler = { [weak self] connection in
            guard let self else { connection.cancel(); return }
            let id = UUID()
            self.connections[id] = connection
            connection.start(queue: self.queue)
            self.receive(connection, id: id, accumulated: Data())
        }
        listener.start(queue: queue)
    }

    private func receive(_ connection: NWConnection, id: UUID, accumulated: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16_384) { [weak self] data, _, complete, error in
            guard let self else { connection.cancel(); return }
            var request = accumulated
            if let data { request.append(data) }
            if request.count > 16_384 || error != nil {
                self.finish(connection, id: id); return
            }
            if request.range(of: Data("\r\n\r\n".utf8)) != nil {
                let response = self.response(for: request)
                connection.send(content: response, completion: .contentProcessed { _ in self.finish(connection, id: id) })
            } else if complete { self.finish(connection, id: id) }
            else { self.receive(connection, id: id, accumulated: request) }
        }
    }

    private func finish(_ connection: NWConnection, id: UUID) {
        connection.cancel()
        connections.removeValue(forKey: id)
    }

    // Internal for the standalone server regression check.
    func response(for request: Data) -> Data {
        guard let header = String(data: request, encoding: .utf8) else { return reply(400, "Bad Request") }
        let lines = header.components(separatedBy: "\r\n")
        let first = (lines.first ?? "").split(separator: " ")
        guard first.count == 3 else { return reply(400, "Bad Request") }
        let method = String(first[0])
        guard method == "GET" || method == "HEAD" else { return reply(405, "Method Not Allowed") }
        let target = String(first[1]).components(separatedBy: "?")[0]
        guard let path = target.removingPercentEncoding, path.hasPrefix("/"), !path.contains("\0"),
              !path.split(separator: "/").contains("..") else { return reply(403, "Forbidden") }
        let relative = path == "/" ? "index.html" : String(path.dropFirst())
        let file = root.appendingPathComponent(relative).standardizedFileURL.resolvingSymlinksInPath()
        guard file.path.hasPrefix(root.path + "/") else { return reply(403, "Forbidden") }
        guard let body = try? Data(contentsOf: file, options: .mappedIfSafe) else { return reply(404, "Not Found") }
        let types = ["html": "text/html; charset=utf-8", "js": "application/javascript", "css": "text/css; charset=utf-8", "json": "application/json",
                     "png": "image/png", "m4a": "audio/mp4", "mp4": "video/mp4", "txt": "text/plain"]
        let type = types[file.pathExtension] ?? "application/octet-stream"
        let rangeHeader = lines.first { $0.lowercased().hasPrefix("range:") }?.dropFirst(6).trimmingCharacters(in: .whitespaces)
        if let rangeHeader {
            guard rangeHeader.hasPrefix("bytes="), !rangeHeader.contains(","), body.count > 0 else {
                return reply(416, "Range Not Satisfiable", extra: "Content-Range: bytes */\(body.count)\r\n")
            }
            let parts = rangeHeader.dropFirst(6).split(separator: "-", omittingEmptySubsequences: false)
            guard parts.count == 2 else { return reply(416, "Range Not Satisfiable") }
            let start: Int, end: Int
            if parts[0].isEmpty {
                guard let length = Int(parts[1]), length > 0 else { return reply(416, "Range Not Satisfiable") }
                start = max(0, body.count - length); end = body.count - 1
            } else {
                guard let value = Int(parts[0]), value >= 0, value < body.count else {
                    return reply(416, "Range Not Satisfiable", extra: "Content-Range: bytes */\(body.count)\r\n")
                }
                start = value
                if parts[1].isEmpty { end = body.count - 1 }
                else {
                    guard let value = Int(parts[1]), value >= start else { return reply(416, "Range Not Satisfiable") }
                    end = min(value, body.count - 1)
                }
            }
            return reply(206, "Partial Content", body: body.subdata(in: start..<(end + 1)), type: type,
                         extra: "Content-Range: bytes \(start)-\(end)/\(body.count)\r\n", head: method == "HEAD")
        }
        return reply(200, "OK", body: body, type: type, head: method == "HEAD")
    }

    private func reply(_ status: Int, _ reason: String, body: Data = Data(), type: String = "text/plain", extra: String = "", head: Bool = false) -> Data {
        var data = Data("HTTP/1.1 \(status) \(reason)\r\nContent-Type: \(type)\r\nContent-Length: \(body.count)\r\nAccept-Ranges: bytes\r\nCache-Control: no-store\r\nConnection: close\r\n\(extra)\r\n".utf8)
        if !head { data.append(body) }
        return data
    }
}
