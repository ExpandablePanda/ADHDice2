import Capacitor
import Foundation
import WidgetKit

@objc(ADHDiceFocusWidgetPlugin)
public final class ADHDiceFocusWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ADHDiceFocusWidgetPlugin"
    public let jsName = "ADHDiceFocusWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "publishSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSnapshot", returnType: CAPPluginReturnPromise),
    ]

    private static let appGroup = "group.com.andrewschaffer.adhdice"
    private static let storageKey = "adhdice.focus.widget.snapshot.v1"
    private static let widgetKind = "ADHDiceWidgets"
    private let storageQueue = DispatchQueue(label: "com.andrewschaffer.adhdice.focus-widget", qos: .utility)

    private struct FocusWidgetSnapshot: Codable, Equatable {
        let sessionId: String
        let categoryId: String
        let categoryTitle: String
        let mode: String
        let isRunning: Bool
        let startedAt: String?
        let accumulatedSeconds: Double
        let countdownTargetSeconds: Double?
        let updatedAt: String

        init?(object: [String: Any]) {
            guard
                let sessionId = object["sessionId"] as? String,
                !sessionId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                let categoryId = object["categoryId"] as? String,
                !categoryId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                let categoryTitle = object["categoryTitle"] as? String,
                !categoryTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                let mode = object["mode"] as? String,
                mode == "countup" || mode == "countdown",
                let isRunning = (object["isRunning"] as? NSNumber)?.boolValue,
                let accumulatedNumber = object["accumulatedSeconds"] as? NSNumber,
                let updatedAt = object["updatedAt"] as? String,
                Self.parseDate(updatedAt) != nil
            else {
                return nil
            }

            let accumulatedSeconds = accumulatedNumber.doubleValue
            guard accumulatedSeconds.isFinite, accumulatedSeconds >= 0 else {
                return nil
            }

            let startedAt = object["startedAt"] as? String
            if let startedAt, Self.parseDate(startedAt) == nil {
                return nil
            }
            if isRunning && startedAt == nil {
                return nil
            }

            let countdownTargetSeconds: Double?
            if let countdownNumber = object["countdownTargetSeconds"] as? NSNumber {
                let value = countdownNumber.doubleValue
                guard value.isFinite, value > 0 else {
                    return nil
                }
                countdownTargetSeconds = value
            } else {
                countdownTargetSeconds = nil
            }
            if mode == "countdown" && countdownTargetSeconds == nil {
                return nil
            }

            self.sessionId = sessionId
            self.categoryId = categoryId
            self.categoryTitle = categoryTitle
            self.mode = mode
            self.isRunning = isRunning
            self.startedAt = startedAt
            self.accumulatedSeconds = accumulatedSeconds
            self.countdownTargetSeconds = countdownTargetSeconds
            self.updatedAt = updatedAt
        }

        private static func parseDate(_ value: String) -> Date? {
            ISO8601DateFormatter().date(from: value)
        }
    }

    @objc func publishSnapshot(_ call: CAPPluginCall) {
        guard
            let object = call.getObject("snapshot"),
            let snapshot = FocusWidgetSnapshot(object: object),
            let data = try? JSONEncoder().encode(snapshot)
        else {
            store(data: nil, call: call, result: ["published": false, "cleared": true])
            return
        }
        store(data: data, call: call, result: ["published": true, "cleared": false])
    }

    @objc func clearSnapshot(_ call: CAPPluginCall) {
        store(data: nil, call: call, result: ["published": false, "cleared": true])
    }

    private func store(data: Data?, call: CAPPluginCall, result: [String: Any]) {
        storageQueue.async {
            guard let defaults = UserDefaults(suiteName: Self.appGroup) else {
                DispatchQueue.main.async { call.resolve(["published": false, "cleared": false]) }
                return
            }

            let previousData = defaults.data(forKey: Self.storageKey)
            let changed = previousData != data
            if let data {
                defaults.set(data, forKey: Self.storageKey)
            } else {
                defaults.removeObject(forKey: Self.storageKey)
            }
            if changed {
                WidgetCenter.shared.reloadTimelines(ofKind: Self.widgetKind)
            }
            DispatchQueue.main.async { call.resolve(result) }
        }
    }
}
