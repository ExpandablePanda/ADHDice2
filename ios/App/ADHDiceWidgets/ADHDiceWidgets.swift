import Foundation
import SwiftUI
import WidgetKit

private let focusWidgetAppGroup = "group.com.andrewschaffer.adhdice"
private let focusWidgetStorageKey = "adhdice.focus.widget.snapshot.v1"
private let focusWidgetURL = URL(string: "adhdice://focus")!

struct FocusWidgetSnapshot: Codable {
    let sessionId: String
    let categoryId: String
    let categoryTitle: String
    let mode: String
    let isRunning: Bool
    let startedAt: String?
    let accumulatedSeconds: Double
    let countdownTargetSeconds: Double?
    let updatedAt: String

    var isValid: Bool {
        guard
            !sessionId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            !categoryId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            !categoryTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            mode == "countup" || mode == "countdown",
            accumulatedSeconds.isFinite,
            accumulatedSeconds >= 0,
            Self.parseDate(updatedAt) != nil
        else {
            return false
        }
        if let startedAt, Self.parseDate(startedAt) == nil {
            return false
        }
        if isRunning && startedAt == nil {
            return false
        }
        if mode == "countdown" {
            guard let countdownTargetSeconds, countdownTargetSeconds.isFinite, countdownTargetSeconds > 0 else {
                return false
            }
        }
        return true
    }

    func parsedStartedAt() -> Date? {
        guard let startedAt else { return nil }
        return Self.parseDate(startedAt)
    }

    private static func parseDate(_ value: String) -> Date? {
        ISO8601DateFormatter().date(from: value)
    }
}

struct FocusWidgetEntry: TimelineEntry {
    let date: Date
    let snapshot: FocusWidgetSnapshot?
}

struct Provider: TimelineProvider {
    private let defaults = UserDefaults(suiteName: focusWidgetAppGroup)

    func placeholder(in context: Context) -> FocusWidgetEntry {
        FocusWidgetEntry(date: Date(), snapshot: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (FocusWidgetEntry) -> Void) {
        completion(FocusWidgetEntry(date: Date(), snapshot: readSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FocusWidgetEntry>) -> Void) {
        let now = Date()
        let entry = FocusWidgetEntry(date: now, snapshot: readSnapshot())
        let refreshDate = Calendar.current.date(byAdding: .minute, value: 15, to: now) ?? now.addingTimeInterval(900)
        completion(Timeline(entries: [entry], policy: .after(refreshDate)))
    }

    private func readSnapshot() -> FocusWidgetSnapshot? {
        guard
            let data = defaults?.data(forKey: focusWidgetStorageKey),
            let snapshot = try? JSONDecoder().decode(FocusWidgetSnapshot.self, from: data),
            snapshot.isValid
        else {
            return nil
        }
        return snapshot
    }
}

struct ADHDiceWidgetsEntryView: View {
    let entry: FocusWidgetEntry

    var body: some View {
        ZStack {
            if let snapshot = entry.snapshot {
                activeContent(snapshot)
            } else {
                Image(systemName: "scope")
                    .font(.system(size: 27, weight: .semibold))
                    .accessibilityLabel("Focus")
            }
        }
        .widgetURL(focusWidgetURL)
        .containerBackground(for: .widget) {
            Color.clear
        }
    }

    @ViewBuilder
    private func activeContent(_ snapshot: FocusWidgetSnapshot) -> some View {
        VStack(spacing: 1) {
            Image(systemName: snapshot.isRunning ? "scope" : "pause.fill")
                .font(.system(size: 12, weight: .bold))
                .accessibilityHidden(true)
            timerContent(snapshot)
        }
        .lineLimit(1)
        .minimumScaleFactor(0.55)
        .monospacedDigit()
        .accessibilityElement(children: .combine)
        .accessibilityLabel(snapshot.isRunning ? "Focus timer" : "Paused Focus timer")
    }

    @ViewBuilder
    private func timerContent(_ snapshot: FocusWidgetSnapshot) -> some View {
        if snapshot.mode == "countdown" {
            countdownContent(snapshot)
        } else if snapshot.isRunning, let startedAt = snapshot.parsedStartedAt() {
            let timerStart = startedAt.addingTimeInterval(-snapshot.accumulatedSeconds)
            Text(timerInterval: timerStart...Date.distantFuture, countsDown: false, showsHours: true)
                .font(.system(size: 12, weight: .semibold, design: .rounded))
        } else {
            Text(formatDuration(snapshot.accumulatedSeconds))
                .font(.system(size: 12, weight: .semibold, design: .rounded))
        }
    }

    @ViewBuilder
    private func countdownContent(_ snapshot: FocusWidgetSnapshot) -> some View {
        if let target = snapshot.countdownTargetSeconds,
           snapshot.isRunning,
           let startedAt = snapshot.parsedStartedAt() {
            let endDate = startedAt.addingTimeInterval(target - snapshot.accumulatedSeconds)
            if entry.date >= endDate {
                Text("00:00")
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
            } else {
                Text(timerInterval: entry.date...endDate, countsDown: true, showsHours: true)
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
            }
        } else {
            Text(formatDuration(max(0, (snapshot.countdownTargetSeconds ?? 0) - snapshot.accumulatedSeconds)))
                .font(.system(size: 12, weight: .semibold, design: .rounded))
        }
    }

    private func formatDuration(_ seconds: Double) -> String {
        let totalSeconds = max(0, Int(seconds.rounded(.down)))
        let hours = totalSeconds / 3600
        let minutes = (totalSeconds % 3600) / 60
        let remainder = totalSeconds % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, remainder)
        }
        return String(format: "%02d:%02d", minutes, remainder)
    }
}

struct ADHDiceWidgets: Widget {
    let kind: String = "ADHDiceWidgets"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            ADHDiceWidgetsEntryView(entry: entry)
        }
        .configurationDisplayName("Focus")
        .description("Open ADHDice Focus or see the selected Focus timer.")
        .supportedFamilies([.accessoryCircular])
    }
}

#Preview(as: .accessoryCircular) {
    ADHDiceWidgets()
} timeline: {
    FocusWidgetEntry(date: .now, snapshot: nil)
}
