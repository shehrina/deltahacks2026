import Foundation

final class TelemetryWebSocket {

    private var socket: URLSessionWebSocketTask?
    private let decoder = JSONDecoder()
    private var isConnected = false
    private var reconnectTimer: Timer?
    
    // For Swift Playgrounds on iPad/iPhone, replace "localhost" with your computer's IP address
    // Example: "ws://192.168.1.100:8080"
    private let baseURL = "ws://localhost:8080"

    var onMessage: ((TelemetryMessage) -> Void)?
    var onConnectionChange: ((Bool) -> Void)?

    func connect() {
        // Disconnect existing connection if any
        if socket != nil {
            disconnect()
        }
        
        guard let url = URL(string: baseURL) else {
            print("Invalid WebSocket URL: \(baseURL)")
            return
        }
        
        socket = URLSession.shared.webSocketTask(with: url)
        socket?.resume()
        isConnected = true
        onConnectionChange?(true)
        listen()
    }

    func disconnect() {
        reconnectTimer?.invalidate()
        reconnectTimer = nil
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        isConnected = false
        onConnectionChange?(false)
    }

    private func listen() {
        socket?.receive { [weak self] result in
            guard let self = self else { return }
            
            switch result {
            case .success(let message):
                if case .string(let text) = message,
                   let data = text.data(using: .utf8),
                   let decoded = try? self.decoder.decode(TelemetryMessage.self, from: data) {
                    self.onMessage?(decoded)
                }
                // Continue listening
                self.listen()
                
            case .failure(let error):
                print("WebSocket receive error: \(error.localizedDescription)")
                let oldSocket = self.socket
                self.socket = nil
                self.isConnected = false
                self.onConnectionChange?(false)
                oldSocket?.cancel(with: .abnormalClosure, reason: nil)
                // Attempt to reconnect after a delay
                self.scheduleReconnect()
            }
        }
    }
    
    private func scheduleReconnect() {
        reconnectTimer?.invalidate()
        reconnectTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: false) { [weak self] _ in
            self?.connect()
        }
    }
}
