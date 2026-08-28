import Capacitor
import Foundation
import HealthKit

@objc(ADHDiceHealthKitPlugin)
public class ADHDiceHealthKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ADHDiceHealthKitPlugin"
    public let jsName = "ADHDiceHealthKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestReadAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readHealthSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readIncrementalHealthChanges", returnType: CAPPluginReturnPromise)
    ]

    private let healthStore = HKHealthStore()
    private let incrementalQueue = DispatchQueue(label: "com.andrewschaffer.adhdice.healthkit.incremental", qos: .userInitiated)
    private let incrementalDefaults = UserDefaults.standard
    private let incrementalStorageVersion = "v1"

    private enum BridgeError: LocalizedError {
        case unavailable
        case invalidRange(String)
        case invalidScope
        case authorizationFailed(String)
        case queryFailed(String)
        case storageFailed(String)

        var code: String {
            switch self {
            case .unavailable: return "HEALTHKIT_UNAVAILABLE"
            case .invalidRange: return "HEALTHKIT_INVALID_RANGE"
            case .invalidScope: return "HEALTHKIT_INVALID_SCOPE"
            case .authorizationFailed: return "HEALTHKIT_AUTHORIZATION_FAILED"
            case .queryFailed: return "HEALTHKIT_QUERY_FAILED"
            case .storageFailed: return "HEALTHKIT_STORAGE_FAILED"
            }
        }

        var errorDescription: String? {
            switch self {
            case .unavailable: return "Apple Health is unavailable on this device."
            case .invalidScope: return "An ADHDice account scope key is required for incremental Apple Health reads."
            case .invalidRange(let message), .authorizationFailed(let message), .queryFailed(let message), .storageFailed(let message): return message
            }
        }
    }

    private struct DateRange {
        let start: Date
        let end: Date
        let calendar: Calendar
    }

    private struct SleepInterval {
        let start: Date
        let end: Date
    }

    private enum IncrementalHealthType: String, CaseIterable {
        case steps
        case activeEnergy
        case exerciseTime
        case sleep
        case bodyMass
        case workouts

        var sampleType: HKSampleType? {
            switch self {
            case .steps: return HKObjectType.quantityType(forIdentifier: .stepCount)
            case .activeEnergy: return HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)
            case .exerciseTime: return HKObjectType.quantityType(forIdentifier: .appleExerciseTime)
            case .sleep: return HKObjectType.categoryType(forIdentifier: .sleepAnalysis)
            case .bodyMass: return HKObjectType.quantityType(forIdentifier: .bodyMass)
            case .workouts: return HKObjectType.workoutType()
            }
        }
    }

    private struct IncrementalTypeRead {
        let added: Int
        let deleted: Int
        let anchor: HKQueryAnchor
    }

    private var readTypes: Set<HKObjectType> {
        var types = Set<HKObjectType>()
        if let type = HKObjectType.quantityType(forIdentifier: .stepCount) { types.insert(type) }
        if let type = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) { types.insert(type) }
        if let type = HKObjectType.quantityType(forIdentifier: .appleExerciseTime) { types.insert(type) }
        if let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { types.insert(type) }
        if let type = HKObjectType.quantityType(forIdentifier: .bodyMass) { types.insert(type) }
        types.insert(HKObjectType.workoutType())
        return types
    }

    private let requestedReadTypeLabels = [
        "Step Count",
        "Active Energy Burned",
        "Apple Exercise Time",
        "Sleep Analysis",
        "Body Mass",
        "Workouts"
    ]

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable(), "platform": "ios"])
    }

    @objc func requestReadAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            reject(call, BridgeError.unavailable)
            return
        }
        healthStore.requestAuthorization(toShare: Set<HKSampleType>(), read: readTypes) { [weak self] success, error in
            DispatchQueue.main.async {
                guard let self else { return }
                if let error {
                    self.reject(call, .authorizationFailed(error.localizedDescription))
                    return
                }
                guard success else {
                    self.reject(call, .authorizationFailed("Apple Health read authorization did not complete."))
                    return
                }
                call.resolve([
                    "authorizationCompleted": true,
                    "requestedReadTypes": self.requestedReadTypeLabels
                ])
            }
        }
    }

    @objc func readHealthSnapshot(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            reject(call, BridgeError.unavailable)
            return
        }
        do {
            let range = try dateRange(from: call)
            querySnapshot(range: range) { [weak self] result in
                DispatchQueue.main.async {
                    guard let self else { return }
                    switch result {
                    case .success(let snapshot): call.resolve(snapshot)
                    case .failure(let error): self.reject(call, error)
                    }
                }
            }
        } catch let error as BridgeError {
            reject(call, error)
        } catch {
            reject(call, .invalidRange("Apple Health date range is invalid."))
        }
    }

    @objc func readIncrementalHealthChanges(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            reject(call, BridgeError.unavailable)
            return
        }
        guard let rawScopeKey = call.getString("scopeKey") else {
            reject(call, BridgeError.invalidScope)
            return
        }
        let scopeKey = rawScopeKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !scopeKey.isEmpty else {
            reject(call, BridgeError.invalidScope)
            return
        }

        incrementalQueue.async { [weak self] in
            guard let self else { return }
            self.queryIncrementalHealthChanges(scopeKey: scopeKey) { result in
                DispatchQueue.main.async {
                    switch result {
                    case .success(let payload): call.resolve(payload)
                    case .failure(let error): self.reject(call, error)
                    }
                }
            }
        }
    }

    private func queryIncrementalHealthChanges(
        scopeKey: String,
        completion: @escaping (Result<[String: Any], BridgeError>) -> Void
    ) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .autoupdatingCurrent
        let baselineStartDate = incrementalBaselineStartDate(scopeKey: scopeKey, calendar: calendar)
        var anchors: [IncrementalHealthType: HKQueryAnchor] = [:]
        var initialized = false

        IncrementalHealthType.allCases.forEach { type in
            switch loadIncrementalAnchor(scopeKey: scopeKey, type: type) {
            case .valid(let anchor): anchors[type] = anchor
            case .missing, .corrupt:
                initialized = true
            }
        }

        let group = DispatchGroup()
        let lock = NSLock()
        var typeResults: [String: [String: Any]] = [:]
        var failedTypes: [String: String] = [:]

        func recordFailure(_ type: IncrementalHealthType, _ message: String) {
            lock.lock()
            failedTypes[type.rawValue] = message
            lock.unlock()
        }

        IncrementalHealthType.allCases.forEach { type in
            guard let sampleType = type.sampleType else {
                recordFailure(type, "Apple Health does not support \(type.rawValue).")
                return
            }
            group.enter()
            queryIncrementalType(sampleType: sampleType, anchor: anchors[type], baselineStartDate: baselineStartDate) { result in
                switch result {
                case .success(let read):
                    lock.lock()
                    typeResults[type.rawValue] = ["added": read.added, "deleted": read.deleted]
                    lock.unlock()
                    do {
                        try self.saveIncrementalAnchor(read.anchor, scopeKey: scopeKey, type: type)
                    } catch {
                        recordFailure(type, "Apple Health \(type.rawValue) anchor could not be saved.")
                    }
                case .failure(let error):
                    recordFailure(type, error.localizedDescription ?? "Apple Health \(type.rawValue) query failed.")
                }
                group.leave()
            }
        }

        group.notify(queue: incrementalQueue) {
            lock.lock()
            let results = typeResults
            let failures = failedTypes
            lock.unlock()

            var types: [String: Any] = [:]
            var totalAdded = 0
            var totalDeleted = 0
            IncrementalHealthType.allCases.forEach { type in
                let result = results[type.rawValue] ?? ["added": 0, "deleted": 0]
                types[type.rawValue] = result
                totalAdded += result["added"] as? Int ?? 0
                totalDeleted += result["deleted"] as? Int ?? 0
            }
            completion(.success([
                "initialized": initialized,
                "baselineStartDate": self.iso8601String(from: baselineStartDate),
                "types": types,
                "totalAdded": totalAdded,
                "totalDeleted": totalDeleted,
                "failedTypes": failures
            ]))
        }
    }

    private func queryIncrementalType(
        sampleType: HKSampleType,
        anchor: HKQueryAnchor?,
        baselineStartDate: Date,
        completion: @escaping (Result<IncrementalTypeRead, BridgeError>) -> Void
    ) {
        let predicate = HKQuery.predicateForSamples(withStart: baselineStartDate, end: nil, options: .strictStartDate)
        let query = HKAnchoredObjectQuery(
            type: sampleType,
            predicate: predicate,
            anchor: anchor,
            limit: HKObjectQueryNoLimit
        ) { _, samples, deletedObjects, newAnchor, error in
            if let error {
                completion(.failure(.queryFailed(error.localizedDescription)))
                return
            }
            guard let newAnchor else {
                completion(.failure(.queryFailed("Apple Health returned no replacement anchor.")))
                return
            }
            completion(.success(IncrementalTypeRead(
                added: samples?.count ?? 0,
                deleted: deletedObjects?.count ?? 0,
                anchor: newAnchor
            )))
        }
        healthStore.execute(query)
    }

    private enum StoredIncrementalAnchor {
        case missing
        case valid(HKQueryAnchor)
        case corrupt
    }

    private func loadIncrementalAnchor(scopeKey: String, type: IncrementalHealthType) -> StoredIncrementalAnchor {
        let key = incrementalAnchorKey(scopeKey: scopeKey, type: type)
        guard let data = incrementalDefaults.data(forKey: key) else { return .missing }
        do {
            guard let anchor = try NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data) else {
                incrementalDefaults.removeObject(forKey: key)
                return .corrupt
            }
            return .valid(anchor)
        } catch {
            incrementalDefaults.removeObject(forKey: key)
            return .corrupt
        }
    }

    private func saveIncrementalAnchor(_ anchor: HKQueryAnchor, scopeKey: String, type: IncrementalHealthType) throws {
        let data = try NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true)
        incrementalDefaults.set(data, forKey: incrementalAnchorKey(scopeKey: scopeKey, type: type))
    }

    private func incrementalBaselineStartDate(scopeKey: String, calendar: Calendar) -> Date {
        let key = incrementalBaselineKey(scopeKey: scopeKey)
        if let stored = incrementalDefaults.string(forKey: key), let date = parseDate(stored) {
            return date
        }
        let today = calendar.startOfDay(for: Date())
        let baseline = calendar.date(byAdding: .day, value: -6, to: today) ?? today
        incrementalDefaults.set(iso8601String(from: baseline), forKey: key)
        return baseline
    }

    private func incrementalStoragePrefix(scopeKey: String) -> String {
        let encodedScope = scopeKey.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "scope"
        return "adhdice.healthkit.anchor.\(incrementalStorageVersion).\(encodedScope)"
    }

    private func incrementalAnchorKey(scopeKey: String, type: IncrementalHealthType) -> String {
        "\(incrementalStoragePrefix(scopeKey: scopeKey)).\(type.rawValue)"
    }

    private func incrementalBaselineKey(scopeKey: String) -> String {
        "\(incrementalStoragePrefix(scopeKey: scopeKey)).baselineStartDate"
    }

    private func iso8601String(from date: Date) -> String {
        ISO8601DateFormatter().string(from: date)
    }

    private func dateRange(from call: CAPPluginCall) throws -> DateRange {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .autoupdatingCurrent
        let start: Date
        let end: Date
        let startString = call.getString("startDate")
        let endString = call.getString("endDate")
        if startString == nil && endString == nil {
            let today = calendar.startOfDay(for: Date())
            start = calendar.date(byAdding: .day, value: -6, to: today)!
            end = calendar.date(byAdding: .day, value: 1, to: today)!
        } else {
            guard let startString, let endString,
                  let parsedStart = parseDate(startString), let parsedEnd = parseDate(endString) else {
                throw BridgeError.invalidRange("Both Apple Health range dates must be valid ISO dates.")
            }
            start = parsedStart
            end = parsedEnd
        }
        guard end > start else {
            throw BridgeError.invalidRange("The Apple Health range must end after it starts.")
        }
        guard let maximumEnd = calendar.date(byAdding: .day, value: 7, to: start), end <= maximumEnd else {
            throw BridgeError.invalidRange("The Apple Health range cannot exceed seven days.")
        }
        return DateRange(start: start, end: end, calendar: calendar)
    }

    private func parseDate(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: value) ?? {
            formatter.formatOptions = [.withInternetDateTime]
            return formatter.date(from: value)
        }()
    }

    private func querySnapshot(range: DateRange, completion: @escaping (Result<[String: Any], BridgeError>) -> Void) {
        let predicate = HKQuery.predicateForSamples(withStart: range.start, end: range.end, options: .strictStartDate)
        let group = DispatchGroup()
        let lock = NSLock()
        var firstError: BridgeError?
        var steps: [String: Double] = [:]
        var activeEnergy: [String: Double] = [:]
        var exerciseMinutes: [String: Double] = [:]
        var sleepMinutes: [String: Double] = [:]
        var bodyMass: [[String: Any]] = []
        var workouts: [[String: Any]] = []

        func recordError(_ error: BridgeError) {
            lock.lock()
            if firstError == nil { firstError = error }
            lock.unlock()
        }

        group.enter()
        queryDailyQuantity(.stepCount, unit: .count(), predicate: predicate, range: range) { result in
            if case .success(let values) = result { steps = values } else if case .failure(let error) = result { recordError(error) }
            group.leave()
        }
        group.enter()
        queryDailyQuantity(.activeEnergyBurned, unit: .kilocalorie(), predicate: predicate, range: range) { result in
            if case .success(let values) = result { activeEnergy = values } else if case .failure(let error) = result { recordError(error) }
            group.leave()
        }
        group.enter()
        queryDailyQuantity(.appleExerciseTime, unit: .minute(), predicate: predicate, range: range) { result in
            if case .success(let values) = result { exerciseMinutes = values } else if case .failure(let error) = result { recordError(error) }
            group.leave()
        }
        group.enter()
        querySleep(range: range) { result in
            if case .success(let values) = result { sleepMinutes = values } else if case .failure(let error) = result { recordError(error) }
            group.leave()
        }
        group.enter()
        queryBodyMass(predicate: predicate) { result in
            if case .success(let values) = result { bodyMass = values } else if case .failure(let error) = result { recordError(error) }
            group.leave()
        }
        group.enter()
        queryWorkouts(predicate: predicate) { result in
            if case .success(let values) = result { workouts = values } else if case .failure(let error) = result { recordError(error) }
            group.leave()
        }

        group.notify(queue: .global(qos: .userInitiated)) {
            if let firstError {
                completion(.failure(firstError))
                return
            }
            let dates = Set(steps.keys).union(activeEnergy.keys).union(exerciseMinutes.keys).union(sleepMinutes.keys).sorted()
            let dailyMetrics = dates.compactMap { date -> [String: Any]? in
                let values = [
                    steps[date] ?? 0,
                    activeEnergy[date] ?? 0,
                    exerciseMinutes[date] ?? 0,
                    sleepMinutes[date] ?? 0
                ]
                guard values.contains(where: { $0 > 0 }) else { return nil }
                return [
                    "date": date,
                    "steps": steps[date] ?? 0,
                    "activeEnergyKcal": activeEnergy[date] ?? 0,
                    "exerciseMinutes": exerciseMinutes[date] ?? 0,
                    "asleepMinutes": sleepMinutes[date] ?? 0
                ]
            }
            completion(.success([
                "startDate": ISO8601DateFormatter().string(from: range.start),
                "endDate": ISO8601DateFormatter().string(from: range.end),
                "dailyMetrics": dailyMetrics,
                "bodyMass": bodyMass,
                "workouts": workouts
            ]))
        }
    }

    private func queryDailyQuantity(
        _ identifier: HKQuantityTypeIdentifier,
        unit: HKUnit,
        predicate: NSPredicate,
        range: DateRange,
        completion: @escaping (Result<[String: Double], BridgeError>) -> Void
    ) {
        guard let quantityType = HKObjectType.quantityType(forIdentifier: identifier) else {
            completion(.failure(.queryFailed("Apple Health does not support \(identifier.rawValue).")))
            return
        }
        let anchor = range.calendar.startOfDay(for: range.start)
        let query = HKStatisticsCollectionQuery(
            quantityType: quantityType,
            quantitySamplePredicate: predicate,
            options: .cumulativeSum,
            anchorDate: anchor,
            intervalComponents: DateComponents(day: 1)
        )
        query.initialResultsHandler = { _, collection, error in
            if let error {
                completion(.failure(.queryFailed(error.localizedDescription)))
                return
            }
            var values: [String: Double] = [:]
            collection?.enumerateStatistics(from: range.start, to: range.end) { statistics, _ in
                if let quantity = statistics.sumQuantity() {
                    values[range.calendar.dateKey(for: statistics.startDate)] = quantity.doubleValue(for: unit)
                }
            }
            completion(.success(values))
        }
        healthStore.execute(query)
    }

    private func querySleep(
        range: DateRange,
        completion: @escaping (Result<[String: Double], BridgeError>) -> Void
    ) {
        guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            completion(.failure(.queryFailed("Apple Health sleep analysis is unavailable.")))
            return
        }
        let overlapPredicate = HKQuery.predicateForSamples(withStart: range.start, end: range.end, options: [])
        let query = HKSampleQuery(sampleType: sleepType, predicate: overlapPredicate, limit: HKObjectQueryNoLimit, sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]) { _, samples, error in
            if let error {
                completion(.failure(.queryFailed(error.localizedDescription)))
                return
            }
            let intervals = (samples as? [HKCategorySample] ?? []).compactMap { sample -> SleepInterval? in
                guard self.isAsleepStage(sample.value) else { return nil }
                let start = max(sample.startDate, range.start)
                let end = min(sample.endDate, range.end)
                return end > start ? SleepInterval(start: start, end: end) : nil
            }.sorted { $0.start < $1.start }
            var unioned: [SleepInterval] = []
            intervals.forEach { interval in
                if let prior = unioned.last, interval.start <= prior.end {
                    unioned[unioned.count - 1] = SleepInterval(start: prior.start, end: max(prior.end, interval.end))
                } else {
                    unioned.append(interval)
                }
            }
            var values: [String: Double] = [:]
            unioned.forEach { interval in
                var cursor = interval.start
                while cursor < interval.end {
                    guard let nextDay = range.calendar.date(byAdding: .day, value: 1, to: range.calendar.startOfDay(for: cursor)) else { break }
                    let segmentEnd = min(interval.end, nextDay)
                    let key = range.calendar.dateKey(for: cursor)
                    values[key, default: 0] += segmentEnd.timeIntervalSince(cursor) / 60
                    cursor = segmentEnd
                }
            }
            completion(.success(values))
        }
        healthStore.execute(query)
    }

    private func queryBodyMass(
        predicate: NSPredicate,
        completion: @escaping (Result<[[String: Any]], BridgeError>) -> Void
    ) {
        guard let bodyMassType = HKObjectType.quantityType(forIdentifier: .bodyMass) else {
            completion(.failure(.queryFailed("Apple Health body mass is unavailable.")))
            return
        }
        let query = HKSampleQuery(sampleType: bodyMassType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]) { _, samples, error in
            if let error {
                completion(.failure(.queryFailed(error.localizedDescription)))
                return
            }
            let values = (samples as? [HKQuantitySample] ?? []).compactMap { sample -> [String: Any]? in
                let weightKg = sample.quantity.doubleValue(for: .gramUnit(with: .kilo))
                guard weightKg > 0, weightKg.isFinite else { return nil }
                return ["id": sample.uuid.uuidString, "timestamp": ISO8601DateFormatter().string(from: sample.startDate), "weightKg": weightKg]
            }
            completion(.success(values))
        }
        healthStore.execute(query)
    }

    private func queryWorkouts(
        predicate: NSPredicate,
        completion: @escaping (Result<[[String: Any]], BridgeError>) -> Void
    ) {
        let query = HKSampleQuery(sampleType: HKObjectType.workoutType(), predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]) { _, samples, error in
            if let error {
                completion(.failure(.queryFailed(error.localizedDescription)))
                return
            }
            let values = (samples as? [HKWorkout] ?? []).map { workout -> [String: Any] in
                var value: [String: Any] = [
                    "id": workout.uuid.uuidString,
                    "activityType": workout.workoutActivityType.rawValue,
                    "activityLabel": self.activityLabel(for: workout.workoutActivityType),
                    "startDate": ISO8601DateFormatter().string(from: workout.startDate),
                    "endDate": ISO8601DateFormatter().string(from: workout.endDate),
                    "durationSeconds": workout.duration
                ]
                if let calories = workout.totalEnergyBurned?.doubleValue(for: .kilocalorie()) {
                    value["activeCaloriesKcal"] = calories
                } else {
                    value["activeCaloriesKcal"] = NSNull()
                }
                return value
            }
            completion(.success(values))
        }
        healthStore.execute(query)
    }

    private func isAsleepStage(_ rawValue: Int) -> Bool {
        guard let value = HKCategoryValueSleepAnalysis(rawValue: rawValue) else { return false }
        if value == .inBed || value == .awake {
            return false
        }
        if value == .asleep {
            return true
        }
        if #available(iOS 16.0, *) {
            return value == .asleepUnspecified
                || value == .asleepCore
                || value == .asleepDeep
                || value == .asleepREM
        }
        return false
    }

    private func activityLabel(for activityType: HKWorkoutActivityType) -> String {
        switch activityType {
        case .walking: return "Walking"
        case .running: return "Running"
        case .cycling: return "Cycling"
        case .hiking: return "Hiking"
        case .swimming: return "Swimming"
        case .yoga: return "Yoga"
        case .traditionalStrengthTraining: return "Traditional Strength Training"
        case .functionalStrengthTraining: return "Functional Strength Training"
        case .coreTraining: return "Core Training"
        case .highIntensityIntervalTraining: return "High-Intensity Interval Training"
        case .elliptical: return "Elliptical"
        case .stairClimbing, .stairs: return "Stair Climbing"
        case .rowing: return "Rowing"
        case .flexibility: return "Flexibility"
        case .cooldown: return "Cooldown"
        case .mixedCardio: return "Mixed Cardio"
        case .crossTraining: return "Cross Training"
        case .pilates: return "Pilates"
        case .other: return "Other"
        @unknown default: return "Activity \(activityType.rawValue)"
        }
    }

    private func reject(_ call: CAPPluginCall, _ error: BridgeError) {
        call.reject(error.localizedDescription ?? "Apple Health operation failed.", error.code)
    }
}

private extension Calendar {
    func dateKey(for date: Date) -> String {
        let components = dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", components.year ?? 0, components.month ?? 0, components.day ?? 0)
    }
}
