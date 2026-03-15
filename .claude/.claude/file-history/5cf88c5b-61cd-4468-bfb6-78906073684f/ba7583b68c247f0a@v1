import Foundation
import Observation
import RevenueCat

extension Notification.Name {
    static let subscriptionStatusChanged = Notification.Name("SubscriptionStatusChanged")
}

enum SubscriptionActionResult {
    case success
    case cancelled
    case failure(String)
}

@Observable
final class SubscriptionManager {
    static let shared = SubscriptionManager()

    static let grockProEntitlementID = "pro"
    static let monthlyPackageID = "monthly"
    static let yearlyPackageID = "yearly"
    private static let fallbackSandboxAppUserID = "sbx_ph_qa01"

    private(set) var isPro: Bool = false
    private(set) var customerInfo: CustomerInfo?
    private(set) var currentOffering: Offering?
    private(set) var isLoadingOfferings = false
    private(set) var isLoadingCustomerInfo = false
    private(set) var hasLoadedAtLeastOnce = false
    private(set) var lastErrorMessage: String?

    private var customerInfoStreamTask: Task<Void, Never>?
    private let purchaseLock = NSLock()
    private var isPurchaseInProgress = false
    private var lastLoggedEntitlementSnapshot: String?

    private init() {
        self.isPro = UserDefaults.standard.isPro
    }

    func start() {
        guard Purchases.isConfigured else {
            setError("RevenueCat is not configured.")
            return
        }

        if customerInfoStreamTask == nil {
            customerInfoStreamTask = Task {
                for await updatedInfo in Purchases.shared.customerInfoStream {
                    await MainActor.run {
                        self.apply(customerInfo: updatedInfo)
                    }
                }
            }
        }

        Task {
            await ensureStableSandboxAppUserIDIfNeeded()
            await refreshAll()
        }
    }

    func refreshAll() async {
        await refreshOfferings()
        await refreshCustomerInfo()
    }

    func refreshOfferings() async {
        guard Purchases.isConfigured else { return }

        isLoadingOfferings = true
        defer { isLoadingOfferings = false }

        do {
            let offerings = try await Purchases.shared.offerings()
            currentOffering = offerings.current ?? offerings["default"]

            guard currentOffering != nil else {
                setError("No active offering found. Set a current offering in RevenueCat and add monthly/yearly packages.")
                return
            }

            if monthlyPackage == nil, yearlyPackage == nil {
                setError("Offering loaded, but no monthly/yearly packages were detected.")
                return
            }

            clearError()
        } catch {
            currentOffering = nil
            setError("Could not load offerings: \(error.localizedDescription)")
        }
    }

    func refreshCustomerInfo() async {
        guard Purchases.isConfigured else { return }

        isLoadingCustomerInfo = true
        defer {
            isLoadingCustomerInfo = false
            hasLoadedAtLeastOnce = true
        }

        do {
            let info = try await Purchases.shared.customerInfo()
            await MainActor.run {
                apply(customerInfo: info)
            }
            clearError()
        } catch {
            setError("Could not refresh subscription status: \(error.localizedDescription)")
        }
    }

    func purchase(package: Package) async -> SubscriptionActionResult {
        guard Purchases.isConfigured else {
            let message = "RevenueCat is not configured."
            setError(message)
            return .failure(message)
        }

        guard beginPurchase() else {
            return .failure("Purchase already in progress. Please wait.")
        }
        defer { endPurchase() }

        do {
            let result = try await Purchases.shared.purchase(package: package)
            await MainActor.run {
                apply(customerInfo: result.customerInfo)
            }

            if result.userCancelled {
                return .cancelled
            }

            clearError()
            return .success
        } catch ErrorCode.purchaseCancelledError {
            return .cancelled
        } catch {
            let message = "Purchase failed: \(error.localizedDescription)"
            setError(message)
            return .failure(message)
        }
    }

    func purchaseMonthly() async -> SubscriptionActionResult {
        guard let monthlyPackage else {
            let message = "Monthly package not found in the current offering."
            setError(message)
            return .failure(message)
        }

        return await purchase(package: monthlyPackage)
    }

    func purchaseYearly() async -> SubscriptionActionResult {
        guard let yearlyPackage else {
            let message = "Yearly package not found in the current offering."
            setError(message)
            return .failure(message)
        }

        return await purchase(package: yearlyPackage)
    }

    func restorePurchases() async -> SubscriptionActionResult {
        guard Purchases.isConfigured else {
            let message = "RevenueCat is not configured."
            setError(message)
            return .failure(message)
        }

        do {
            let info = try await Purchases.shared.restorePurchases()
            await MainActor.run {
                apply(customerInfo: info)
            }
            clearError()
            return .success
        } catch {
            let message = "Restore failed: \(error.localizedDescription)"
            setError(message)
            return .failure(message)
        }
    }

    func syncPurchases() async -> SubscriptionActionResult {
        guard Purchases.isConfigured else {
            let message = "RevenueCat is not configured."
            setError(message)
            return .failure(message)
        }

        do {
            let info = try await Purchases.shared.syncPurchases()
            await MainActor.run {
                apply(customerInfo: info)
            }
            clearError()
            return .success
        } catch {
            let message = "Sync purchases failed: \(error.localizedDescription)"
            setError(message)
            return .failure(message)
        }
    }

    func hasActiveEntitlement(_ identifier: String = SubscriptionManager.grockProEntitlementID) -> Bool {
        customerInfo?.entitlements.activeInCurrentEnvironment[identifier] != nil
    }

    var monthlyPackage: Package? {
        guard let offering = currentOffering else { return nil }
        return offering.package(identifier: SubscriptionManager.monthlyPackageID)
            ?? offering.package(identifier: "$rc_monthly")
            ?? offering.monthly
            ?? offering.availablePackages.first(where: { $0.packageType == .monthly })
            ?? offering.availablePackages.first(where: { $0.storeProduct.productIdentifier.lowercased().contains("monthly") })
    }

    var yearlyPackage: Package? {
        guard let offering = currentOffering else { return nil }
        return offering.package(identifier: SubscriptionManager.yearlyPackageID)
            ?? offering.package(identifier: "$rc_annual")
            ?? offering.annual
            ?? offering.availablePackages.first(where: { $0.packageType == .annual })
            ?? offering.availablePackages.first(where: { $0.storeProduct.productIdentifier.lowercased().contains("yearly") || $0.storeProduct.productIdentifier.lowercased().contains("annual") })
    }

    @MainActor
    private func apply(customerInfo: CustomerInfo) {
        self.customerInfo = customerInfo

        let previousIsPro = self.isPro
        let proIsActive = customerInfo.entitlements
            .activeInCurrentEnvironment[SubscriptionManager.grockProEntitlementID] != nil

        debugLogEntitlements(customerInfo: customerInfo, proIsActive: proIsActive)

        self.isPro = proIsActive
        UserDefaults.standard.isPro = proIsActive

        if previousIsPro && !proIsActive {
            // Always force re-pick of editable stores on every Pro -> Free transition.
            UserDefaults.standard.freeEditableStoreKeys = []
            UserDefaults.standard.freePrimaryEditableCartId = nil
        }

        if previousIsPro != proIsActive {
            NotificationCenter.default.post(
                name: .subscriptionStatusChanged,
                object: nil,
                userInfo: [
                    "isPro": proIsActive,
                    "previousIsPro": previousIsPro,
                    "changedAt": Date()
                ]
            )
        }
    }

    private func setError(_ message: String) {
        lastErrorMessage = message
        print("⚠️ [Subscription] \(message)")
    }

    private func clearError() {
        lastErrorMessage = nil
    }

    private func beginPurchase() -> Bool {
        purchaseLock.lock()
        defer { purchaseLock.unlock() }
        guard !isPurchaseInProgress else { return false }
        isPurchaseInProgress = true
        return true
    }

    private func endPurchase() {
        purchaseLock.lock()
        isPurchaseInProgress = false
        purchaseLock.unlock()
    }

    private func ensureStableSandboxAppUserIDIfNeeded() async {
        guard isSandboxReceiptBuild else { return }

        let targetAppUserID = configuredSandboxAppUserID
        let currentAppUserID = Purchases.shared.appUserID
        guard currentAppUserID != targetAppUserID else { return }

        do {
            let result = try await Purchases.shared.logIn(targetAppUserID)
            print("ℹ️ [Subscription] Sandbox/TestFlight identity set to \(targetAppUserID). created=\(result.created)")
        } catch {
            print("⚠️ [Subscription] Failed to set sandbox identity to \(targetAppUserID): \(error.localizedDescription)")
        }
    }

    private var configuredSandboxAppUserID: String {
        guard let rawValue = Bundle.main.object(forInfoDictionaryKey: "REVENUECAT_SANDBOX_APP_USER_ID") as? String else {
            return Self.fallbackSandboxAppUserID
        }

        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? Self.fallbackSandboxAppUserID : trimmed
    }

    private var isSandboxReceiptBuild: Bool {
        Bundle.main.appStoreReceiptURL?.lastPathComponent == "sandboxReceipt"
    }

    private func debugLogEntitlements(customerInfo: CustomerInfo, proIsActive: Bool) {
        #if DEBUG
        let allEntitlements = customerInfo.entitlements.all.keys.sorted()
        let activeEntitlements = customerInfo.entitlements.activeInCurrentEnvironment.keys.sorted()
        let snapshot = "all=\(allEntitlements.joined(separator: ","))|active=\(activeEntitlements.joined(separator: ","))|pro=\(proIsActive)|user=\(Purchases.shared.appUserID)"

        guard snapshot != lastLoggedEntitlementSnapshot else { return }
        lastLoggedEntitlementSnapshot = snapshot

        print("ℹ️ [Subscription] Entitlements all=\(allEntitlements) active=\(activeEntitlements) proActive=\(proIsActive) appUserID=\(Purchases.shared.appUserID)")
        #endif
    }
}
