import Foundation
import Combine

final class PostureViewModel: ObservableObject {

    // Sensor-driven posture
    @Published var upperPitch: Double = 0
    @Published var upperRoll: Double = 0
    @Published var lowerPitch: Double = 0

    // Events
    @Published var lastEvent: String?

    private let ws = TelemetryWebSocket()

    func start() {
        ws.onMessage = { [weak self] msg in
            DispatchQueue.main.async {
                self?.handle(msg)
            }
        }
        ws.connect()
    }

    func stop() {
        ws.disconnect()
    }

    private func handle(_ msg: TelemetryMessage) {

        // Events
        if msg.kind == "event" {
            lastEvent = msg.event
            return
        }

        // Samples - prefer pitch_smooth over pitch if available
        guard msg.kind == "sample" else { return }
        
        let pitch = msg.pitch_smooth ?? msg.pitch ?? 0
        let roll = msg.roll ?? 0

        if msg.source == 1 {
            upperPitch = pitch
            upperRoll = roll
        } else if msg.source == 2 {
            lowerPitch = pitch
        }
    }
}
