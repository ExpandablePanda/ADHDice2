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
        CAPPluginMethod(name: "prepareIncrementalHealthChanges", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "commitIncrementalHealthChanges", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "discardIncrementalHealthChanges", returnType: CAPPluginReturnPromise)
    ]

    private let healthStore = HKHealthStore()
    private let incrementalQueue = DispatchQueue(label: "com.andrewschaffer.adhdice.healthkit.incremental", qos: .userInitiated)
    private let incrementalDefaults = UserDefaults.standard
    private let incrementalStorageVersion = "v1"

    private enum BridgeError: LocalizedError {
        case unavailable
        case invalidRange(String)
        case invalidScope
        case invalidSyncToken
        case conflictingBatch
        case authorizationFailed(String)
        case queryFailed(String)
        case storageFailed(String)

        var code: String {
            switch self {
            case .unavailable: return "HEALTHKIT_UNAVAILABLE"
            case .invalidRange: return "HEALTHKIT_INVALID_RANGE"
            case .invalidScope: return "HEALTHKIT_INVALID_SCOPE"
            case .invalidSyncToken: return "HEALTHKIT_INVALID_SYNC_TOKEN"
            case .conflictingBatch: return "HEALTHKIT_INCREMENTAL_CONFLICT"
            case .authorizationFailed: return "HEALTHKIT_AUTHORIZATION_FAILED"
            case .queryFailed: return "HEALTHKIT_QUERY_FAILED"
            case .storageFailed: return "HEALTHKIT_STORAGE_FAILED"
            }
        }

        var errorDescription: String? {
            switch self {
            case .unavailable: return "Apple Health is unavailable on this device."
            case .invalidScope: return "An ADHDice account scope key is required for incremental Apple Health reads."
            case .invalidSyncToken: return "An Apple Health incremental sync token is required."
            case .conflictingBatch: return "An Apple Health incremental sync is already prepared for this account."
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
        let addedSamples: [[String: Any]]
        let deletedObjectIds: [String]
        let anchor: HKQueryAnchor
    }

    private struct StagedIncrementalType {
        let addedSamples: [[String: Any]]
        let deletedObjectIds: [String]
        let anchor: HKQueryAnchor
        let affectedDates: Set<String>
        let sampleIndex: [String: [String]]?
    }

    private struct PendingIncrementalBatch {
        let scopeKey: String
        let syncToken: String
        let anchors: [IncrementalHealthType: HKQueryAnchor]
        let sampleIndexes: [IncrementalHealthType: [String: [String]]]
        let payload: [String: Any]
    }

    private struct IncrementalMetricPayload {
        let changes: [[String: Any]]
        let failedTypes: [String: String]
    }

    private enum StoredIncrementalSampleIndex {
        case missing
        case valid([String: [String]])
        case corrupt
    }

    private struct CommittedIncrementalState: Codable {
        var anchors: [String: Data]
        var sampleIndexes: [String: [String: [String]]]
    }

    private var pendingIncrementalBatches: [String: PendingIncrementalBatch] = [:]
    private var preparingIncrementalScopes = Set<String>()

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

    @objc func prepareIncrementalHealthChanges(_ call: CAPPluginCall) {
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
            guard self.pendingIncrementalBatches[scopeKey] == nil,
                  !self.preparingIncrementalScopes.contains(scopeKey) else {
                DispatchQueue.main.async { self.reject(call, BridgeError.conflictingBatch) }
                return
            }
            self.preparingIncrementalScopes.insert(scopeKey)
            self.queryIncrementalHealthChanges(scopeKey: scopeKey) { result in
                self.incrementalQueue.async {
                    self.preparingIncrementalScopes.remove(scopeKey)
                    switch result {
                    case .success(let batch):
                        self.pendingIncrementalBatches[scopeKey] = batch
                        DispatchQueue.main.async { call.resolve(batch.payload) }
                    case .failure(let error):
                        DispatchQueue.main.async { self.reject(call, error) }
                    }
                }
            }
        }
    }

    @objc func commitIncrementalHealthChanges(_ call: CAPPluginCall) {
        guard let rawScopeKey = call.getString("scopeKey"),
              let rawSyncToken = call.getString("syncToken") else {
            reject(call, BridgeError.invalidSyncToken)
            return
        }
        let scopeKey = rawScopeKey.trimmingCharacters(in: .whitespacesAndNewlines)
        let syncToken = rawSyncToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !scopeKey.isEmpty else {
            reject(call, BridgeError.invalidScope)
            return
        }
        guard !syncToken.isEmpty else {
            reject(call, BridgeError.invalidSyncToken)
            return
        }

        incrementalQueue.async { [weak self] in
            guard let self else { return }
            guard let batch = self.pendingIncrementalBatches[scopeKey], batch.syncToken == syncToken else {
                DispatchQueue.main.async { self.reject(call, BridgeError.invalidSyncToken) }
                return
            }
            do {
                var state = self.committedIncrementalState(scopeKey: scopeKey)
                for (type, anchor) in batch.anchors {
                    state.anchors[type.rawValue] = try self.archivedAnchorData(anchor)
                }
                for (type, index) in batch.sampleIndexes {
                    state.sampleIndexes[type.rawValue] = index
                }
                self.incrementalDefaults.set(try JSONEncoder().encode(state), forKey: self.incrementalStateKey(scopeKey: scopeKey))
                self.pendingIncrementalBatches.removeValue(forKey: scopeKey)
                DispatchQueue.main.async { call.resolve(["committed": true, "syncToken": syncToken]) }
            } catch {
                DispatchQueue.main.async { self.reject(call, .storageFailed("Apple Health incremental state could not be committed.")) }
            }
        }
    }

    @objc func discardIncrementalHealthChanges(_ call: CAPPluginCall) {
        guard let rawScopeKey = call.getString("scopeKey"),
              let rawSyncToken = call.getString("syncToken") else {
            reject(call, BridgeError.invalidSyncToken)
            return
        }
        let scopeKey = rawScopeKey.trimmingCharacters(in: .whitespacesAndNewlines)
        let syncToken = rawSyncToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !scopeKey.isEmpty else {
            reject(call, BridgeError.invalidScope)
            return
        }
        guard !syncToken.isEmpty else {
            reject(call, BridgeError.invalidSyncToken)
            return
        }
        incrementalQueue.async { [weak self] in
            guard let self else { return }
            guard let batch = self.pendingIncrementalBatches[scopeKey], batch.syncToken == syncToken else {
                DispatchQueue.main.async { self.reject(call, BridgeError.invalidSyncToken) }
                return
            }
            self.pendingIncrementalBatches.removeValue(forKey: scopeKey)
            DispatchQueue.main.async { call.resolve(["discarded": true, "syncToken": syncToken]) }
        }
    }

    private func queryIncrementalHealthChanges(
        scopeKey: String,
        completion: @escaping (Result<PendingIncrementalBatch, BridgeError>) -> Void
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

        let syncToken = UUID().uuidString
        let group = DispatchGroup()
        let lock = NSLock()
        var stagedTypes: [IncrementalHealthType: StagedIncrementalType] = [:]
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
            queryIncrementalType(type: type, sampleType: sampleType, anchor: anchors[type], baselineStartDate: baselineStartDate) { result in
                switch result {
                case .success(let read):
                    let indexState = self.indexedType(type) ? self.loadIncrementalSampleIndex(scopeKey: scopeKey, type: type) : .valid([:])
                    self.stageIncrementalTypeRead(type: type, read: read, indexState: indexState, baselineStartDate: baselineStartDate, calendar: calendar) { stagedResult in
                        switch stagedResult {
                        case .success(let staged):
                            lock.lock()
                            stagedTypes[type] = staged
                            lock.unlock()
                        case .failure(let error):
                            recordFailure(type, error.localizedDescription)
                        }
                        group.leave()
                    }
                case .failure(let error):
                    recordFailure(type, error.localizedDescription)
                    group.leave()
                }
            }
        }

        group.notify(queue: incrementalQueue) {
            lock.lock()
            let reads = stagedTypes
            let failures = failedTypes
            lock.unlock()

            self.queryIncrementalMetricChanges(stagedTypes: reads, baselineStartDate: baselineStartDate, calendar: calendar) { metricResult in
                switch metricResult {
                case .failure(let error): completion(.failure(error))
                case .success(let metricPayload):
                    var successfulReads = reads
                    var allFailures = failures
                    metricPayload.failedTypes.forEach { type, message in
                        allFailures[type] = message
                        if let healthType = IncrementalHealthType(rawValue: type) {
                            successfulReads.removeValue(forKey: healthType)
                        }
                    }
                    var types: [String: Any] = [:]
                    var totalAdded = 0
                    var totalDeleted = 0
                    var anchors: [IncrementalHealthType: HKQueryAnchor] = [:]
                    var sampleIndexes: [IncrementalHealthType: [String: [String]]] = [:]
                    var bodyMass: [[String: Any]] = []
                    var workouts: [[String: Any]] = []
                    var deletedBodyMassIds: [String] = []
                    var deletedWorkoutIds: [String] = []
                    IncrementalHealthType.allCases.forEach { type in
                        types[type.rawValue] = ["added": 0, "deleted": 0]
                    }
                    successfulReads.forEach { type, staged in
                        let added = staged.addedSamples.count
                        let deleted = staged.deletedObjectIds.count
                        types[type.rawValue] = ["added": added, "deleted": deleted]
                        totalAdded += added
                        totalDeleted += deleted
                        anchors[type] = staged.anchor
                        if let index = staged.sampleIndex { sampleIndexes[type] = index }
                        if type == .bodyMass {
                            bodyMass.append(contentsOf: staged.addedSamples)
                            deletedBodyMassIds.append(contentsOf: staged.deletedObjectIds)
                        } else if type == .workouts {
                            workouts.append(contentsOf: staged.addedSamples)
                            deletedWorkoutIds.append(contentsOf: staged.deletedObjectIds)
                        }
                    }
                    let payload: [String: Any] = [
                        "syncToken": syncToken,
                        "initialized": initialized,
                        "baselineStartDate": self.iso8601String(from: baselineStartDate),
                        "types": types,
                        "totalAdded": totalAdded,
                        "totalDeleted": totalDeleted,
                        "failedTypes": allFailures,
                        "metricChanges": metricPayload.changes,
                        "bodyMass": bodyMass,
                        "deletedBodyMassIds": deletedBodyMassIds,
                        "workouts": workouts,
                        "deletedWorkoutIds": deletedWorkoutIds
                    ]
                    completion(.success(PendingIncrementalBatch(scopeKey: scopeKey, syncToken: syncToken, anchors: anchors, sampleIndexes: sampleIndexes, payload: payload)))
                }
            }
        }
    }

    private func queryIncrementalType(
        type: IncrementalHealthType,
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
            let rawSamples = samples ?? []
            let addedSamples = rawSamples.compactMap { self.serializeIncrementalSample($0, type: type) }
            guard addedSamples.count == rawSamples.count else {
                completion(.failure(.queryFailed("Apple Health returned an invalid \(type.rawValue) sample.")))
                return
            }
            completion(.success(IncrementalTypeRead(
                addedSamples: addedSamples,
                deletedObjectIds: (deletedObjects ?? []).map { $0.uuid.uuidString },
                anchor: newAnchor
            )))
        }
        healthStore.execute(query)
    }

    private func stageIncrementalTypeRead(
        type: IncrementalHealthType,
        read: IncrementalTypeRead,
        indexState: StoredIncrementalSampleIndex,
        baselineStartDate: Date,
        calendar: Calendar,
        completion: @escaping (Result<StagedIncrementalType, BridgeError>) -> Void
    ) {
        let finish: ([String: [String]]) -> Void = { baseIndex in
            var sampleIndex = baseIndex
            var affectedDates = Set<String>()
            if self.indexedType(type) {
                for sample in read.addedSamples {
                    guard let id = sample["id"] as? String,
                          let startString = sample["startDate"] as? String,
                          let start = self.parseDate(startString) else {
                        completion(.failure(.queryFailed("Apple Health \(type.rawValue) sample dates could not be indexed.")))
                        return
                    }
                    let end = (sample["endDate"] as? String).flatMap(self.parseDate) ?? start
                    let dates = self.localDateKeys(start: start, end: end, calendar: calendar)
                    sampleIndex[id] = dates
                    affectedDates.formUnion(dates)
                }
                for deletedId in read.deletedObjectIds {
                    guard let dates = sampleIndex[deletedId] else {
                        completion(.failure(.queryFailed("Apple Health \(type.rawValue) deletion \(deletedId) is not mapped to a local date.")))
                        return
                    }
                    affectedDates.formUnion(dates)
                    sampleIndex.removeValue(forKey: deletedId)
                }
            }
            completion(.success(StagedIncrementalType(
                addedSamples: read.addedSamples,
                deletedObjectIds: read.deletedObjectIds,
                anchor: read.anchor,
                affectedDates: affectedDates,
                sampleIndex: self.indexedType(type) ? sampleIndex : nil
            )))
        }
        switch indexState {
        case .valid(let index): finish(index)
        case .missing, .corrupt:
            guard self.indexedType(type) else { finish([:]); return }
            let predicate = HKQuery.predicateForSamples(withStart: baselineStartDate, end: nil, options: .strictStartDate)
            self.queryIncrementalSampleIndex(type: type, predicate: predicate) { result in
                switch result {
                case .success(let index): finish(index)
                case .failure(let error): completion(.failure(error))
                }
            }
        }
    }

    private func indexedType(_ type: IncrementalHealthType) -> Bool {
        type == .steps || type == .activeEnergy || type == .exerciseTime || type == .sleep
    }

    private func localDateKeys(start: Date, end: Date, calendar: Calendar) -> [String] {
        let effectiveEnd = max(start, end)
        var dates: [String] = []
        var cursor = start
        repeat {
            dates.append(calendar.dateKey(for: cursor))
            guard let nextDay = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: cursor)) else { break }
            cursor = nextDay
        } while cursor < effectiveEnd
        return dates
    }

    private func serializeIncrementalSample(_ sample: HKSample, type: IncrementalHealthType) -> [String: Any]? {
        var payload: [String: Any] = [
            "id": sample.uuid.uuidString,
            "startDate": iso8601String(from: sample.startDate),
            "endDate": iso8601String(from: sample.endDate)
        ]
        switch type {
        case .bodyMass:
            guard let quantitySample = sample as? HKQuantitySample else { return nil }
            let weightKg = quantitySample.quantity.doubleValue(for: .gramUnit(with: .kilo))
            guard weightKg > 0, weightKg.isFinite else { return nil }
            payload["timestamp"] = iso8601String(from: sample.startDate)
            payload["weightKg"] = weightKg
        case .workouts:
            guard let workout = sample as? HKWorkout, workout.duration > 0 else { return nil }
            payload["activityType"] = workout.workoutActivityType.rawValue
            payload["activityLabel"] = activityLabel(for: workout.workoutActivityType)
            payload["durationSeconds"] = workout.duration
            if let calories = workout.totalEnergyBurned?.doubleValue(for: .kilocalorie()) {
                payload["activeCaloriesKcal"] = calories
            } else {
                payload["activeCaloriesKcal"] = NSNull()
            }
        case .sleep:
            guard let categorySample = sample as? HKCategorySample else { return nil }
            payload["value"] = categorySample.value
        case .steps, .activeEnergy, .exerciseTime:
            break
        }
        return payload
    }

    private func queryIncrementalSampleIndex(
        type: IncrementalHealthType,
        predicate: NSPredicate,
        completion: @escaping (Result<[String: [String]], BridgeError>) -> Void
    ) {
        guard let sampleType = type.sampleType else {
            completion(.failure(.queryFailed("Apple Health does not support \(type.rawValue).")))
            return
        }
        let query = HKSampleQuery(sampleType: sampleType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
            if let error {
                completion(.failure(.queryFailed(error.localizedDescription)))
                return
            }
            var index: [String: [String]] = [:]
            for sample in samples ?? [] {
                let dates = self.localDateKeys(start: sample.startDate, end: sample.endDate, calendar: Calendar.autoupdatingCurrent)
                index[sample.uuid.uuidString] = dates
            }
            completion(.success(index))
        }
        healthStore.execute(query)
    }

    private func queryIncrementalMetricChanges(
        stagedTypes: [IncrementalHealthType: StagedIncrementalType],
        baselineStartDate: Date,
        calendar: Calendar,
        completion: @escaping (Result<IncrementalMetricPayload, BridgeError>) -> Void
    ) {
        let endDate = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: Date())) ?? Date()
        let range = DateRange(start: baselineStartDate, end: endDate, calendar: calendar)
        let metricTypes: [(IncrementalHealthType, String)] = [
            (.steps, "steps"),
            (.activeEnergy, "active_energy_kcal"),
            (.exerciseTime, "exercise_minutes"),
            (.sleep, "sleep_minutes")
        ]
        let group = DispatchGroup()
        let lock = NSLock()
        var valuesByMetricType: [String: [String: Double]] = [:]
        var failedTypes: [String: String] = [:]

        metricTypes.forEach { healthType, metricType in
            guard let affectedDates = stagedTypes[healthType]?.affectedDates, !affectedDates.isEmpty else { return }
            group.enter()
            let resultHandler: (Result<[String: Double], BridgeError>) -> Void = { result in
                lock.lock()
                switch result {
                case .success(let values): valuesByMetricType[metricType] = values
                case .failure(let error): failedTypes[healthType.rawValue] = error.localizedDescription
                }
                lock.unlock()
                group.leave()
            }
            switch healthType {
            case .steps: queryDailyQuantity(.stepCount, unit: .count(), predicate: HKQuery.predicateForSamples(withStart: baselineStartDate, end: nil, options: .strictStartDate), range: range, completion: resultHandler)
            case .activeEnergy: queryDailyQuantity(.activeEnergyBurned, unit: .kilocalorie(), predicate: HKQuery.predicateForSamples(withStart: baselineStartDate, end: nil, options: .strictStartDate), range: range, completion: resultHandler)
            case .exerciseTime: queryDailyQuantity(.appleExerciseTime, unit: .minute(), predicate: HKQuery.predicateForSamples(withStart: baselineStartDate, end: nil, options: .strictStartDate), range: range, completion: resultHandler)
            case .sleep: querySleep(range: range, completion: resultHandler)
            case .bodyMass, .workouts: group.leave()
            }
        }
        group.notify(queue: incrementalQueue) {
            lock.lock()
            let values = valuesByMetricType
            let failures = failedTypes
            lock.unlock()
            var changes: [[String: Any]] = []
            metricTypes.forEach { healthType, metricType in
                guard let dates = stagedTypes[healthType]?.affectedDates, failures[healthType.rawValue] == nil else { return }
                let dailyValues = values[metricType] ?? [:]
                dates.sorted().forEach { date in
                    changes.append(["date": date, "metricType": metricType, "value": dailyValues[date] ?? 0])
                }
            }
            completion(.success(IncrementalMetricPayload(changes: changes, failedTypes: failures)))
        }
    }

    private enum StoredIncrementalAnchor {
        case missing
        case valid(HKQueryAnchor)
        case corrupt
    }

    private func loadIncrementalAnchor(scopeKey: String, type: IncrementalHealthType) -> StoredIncrementalAnchor {
        if let state = loadCommittedIncrementalState(scopeKey: scopeKey),
           let data = state.anchors[type.rawValue] {
            do {
                guard let anchor = try NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data) else {
                    return .corrupt
                }
                return .valid(anchor)
            } catch {
                return .corrupt
            }
        }
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

    private func loadIncrementalSampleIndex(scopeKey: String, type: IncrementalHealthType) -> StoredIncrementalSampleIndex {
        if let state = loadCommittedIncrementalState(scopeKey: scopeKey),
           let index = state.sampleIndexes[type.rawValue] {
            return .valid(index)
        }
        guard let data = incrementalDefaults.data(forKey: incrementalSampleIndexKey(scopeKey: scopeKey, type: type)) else { return .missing }
        do {
            return .valid(try JSONDecoder().decode([String: [String]].self, from: data))
        } catch {
            return .corrupt
        }
    }

    private func archivedAnchorData(_ anchor: HKQueryAnchor) throws -> Data {
        try NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true)
    }

    private func loadCommittedIncrementalState(scopeKey: String) -> CommittedIncrementalState? {
        guard let data = incrementalDefaults.data(forKey: incrementalStateKey(scopeKey: scopeKey)) else { return nil }
        return try? JSONDecoder().decode(CommittedIncrementalState.self, from: data)
    }

    private func committedIncrementalState(scopeKey: String) -> CommittedIncrementalState {
        if let state = loadCommittedIncrementalState(scopeKey: scopeKey) {
            return state
        }
        var state = CommittedIncrementalState(anchors: [:], sampleIndexes: [:])
        IncrementalHealthType.allCases.forEach { type in
            if let data = incrementalDefaults.data(forKey: incrementalAnchorKey(scopeKey: scopeKey, type: type)) {
                state.anchors[type.rawValue] = data
            }
            if let data = incrementalDefaults.data(forKey: incrementalSampleIndexKey(scopeKey: scopeKey, type: type)),
               let index = try? JSONDecoder().decode([String: [String]].self, from: data) {
                state.sampleIndexes[type.rawValue] = index
            }
        }
        return state
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

    private func incrementalSampleIndexKey(scopeKey: String, type: IncrementalHealthType) -> String {
        "\(incrementalStoragePrefix(scopeKey: scopeKey)).sample-index.\(type.rawValue)"
    }

    private func incrementalStateKey(scopeKey: String) -> String {
        "\(incrementalStoragePrefix(scopeKey: scopeKey)).state"
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
        call.reject(error.localizedDescription, error.code)
    }
}

private extension Calendar {
    func dateKey(for date: Date) -> String {
        let components = dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", components.year ?? 0, components.month ?? 0, components.day ?? 0)
    }
}
