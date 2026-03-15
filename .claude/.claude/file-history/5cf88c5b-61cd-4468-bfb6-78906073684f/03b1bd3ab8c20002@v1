import SwiftUI
import SwiftData
import UserJot
import RevenueCat

struct ContentView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var vaultService: VaultService
    @State private var cartViewModel: CartViewModel
    @State private var homeViewModel: HomeViewModel
    @State private var cartStateManager: CartStateManager
    @State private var subscriptionManager = SubscriptionManager.shared
    @State private var showFreeStoreSelectionSheet = false

    init(modelContext: ModelContext) {
        let vaultService = VaultService(modelContext: modelContext)
        _vaultService = State(initialValue: vaultService)

        let cartViewModel = CartViewModel(vaultService: vaultService)
        _cartViewModel = State(initialValue: cartViewModel)

        _homeViewModel = State(initialValue: HomeViewModel(
            modelContext: modelContext,
            cartViewModel: cartViewModel,
            vaultService: vaultService
        ))
        _cartStateManager = State(initialValue: CartStateManager())
    }

    var body: some View {
        Group {
            if UserDefaults.standard.hasCompletedOnboarding {
                HomeView(viewModel: homeViewModel)
                    .environment(vaultService)
                    .environment(cartViewModel)
                    .environment(cartStateManager)
            } else {
                OnboardingContainer()
                    .environment(vaultService)
                    .environment(cartViewModel)
                    .environment(homeViewModel)
                    .environment(cartStateManager)
            }
        }
        .onAppear {
            refreshStoreSelectionRequirement()
            refreshSubscriptionStatus()
        }
        .onChange(of: scenePhase) { _, newPhase in
            guard newPhase == .active else { return }
            refreshSubscriptionStatus()
        }
        .onReceive(NotificationCenter.default.publisher(for: .subscriptionStatusChanged)) { notification in
            let isPro = (notification.userInfo?["isPro"] as? Bool) ?? subscriptionManager.isPro
            refreshStoreSelectionRequirement(isPro: isPro)
        }
        .onReceive(NotificationCenter.default.publisher(for: .showProUnlockedCelebration)) { notification in
            Task { @MainActor in
                let featureRawValue = notification.userInfo?["featureFocus"] as? String
                let featureFocus = featureRawValue.flatMap(GrockPaywallFeatureFocus.init(rawValue:))
                let contextRawValue = notification.userInfo?["celebrationContext"] as? String
                let celebrationContext = contextRawValue.flatMap(ProUnlockCelebrationContext.init(rawValue:))
                ProUnlockedCelebrationPresenter.shared.show(
                    featureFocus: featureFocus,
                    celebrationContext: celebrationContext
                )
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .toggleProUnlockedCelebration)) { _ in
            Task { @MainActor in
                ProUnlockedCelebrationPresenter.shared.toggle()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: NSNotification.Name("DataUpdated"))) { _ in
            refreshStoreSelectionRequirement(isPro: subscriptionManager.isPro)
        }
        .sheet(isPresented: $showFreeStoreSelectionSheet) {
            FreeStoreSelectionSheet(isPresented: $showFreeStoreSelectionSheet)
                .environment(vaultService)
                .interactiveDismissDisabled(true)
        }
    }

    private func refreshStoreSelectionRequirement(isPro: Bool? = nil) {
        let resolvedIsPro = isPro ?? subscriptionManager.isPro
        showFreeStoreSelectionSheet = vaultService.isFreeStoreSelectionRequired(isPro: resolvedIsPro)
    }

    private func refreshSubscriptionStatus() {
        Task { @MainActor in
            await subscriptionManager.refreshCustomerInfo()
            refreshStoreSelectionRequirement(isPro: subscriptionManager.isPro)
        }
    }
}

@main
struct GrockApp: App {
    let container: ModelContainer
    private static let userJotProjectIdKey = "USERJOT_PROJECT_ID"
    private static let revenueCatApiKeyKey = "REVENUECAT_API_KEY"

    init() {
        do {
            let schema = Schema([
                User.self, Vault.self, Category.self, Item.self,
                PriceOption.self, PricePerUnit.self, Cart.self, CartItem.self
            ])
            let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)

            container = try ModelContainer(for: schema, configurations: config)
            configureRevenueCat()
            configureUserJot()

            Task { @MainActor in
                SubscriptionManager.shared.start()
            }
        } catch {
            fatalError("Could not create ModelContainer: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentViewWrapper()
        }
        .modelContainer(container)
    }

    private func configureUserJot() {
        guard let rawProjectId = Bundle.main.object(forInfoDictionaryKey: Self.userJotProjectIdKey) as? String else {
            print("⚠️ USERJOT_PROJECT_ID is missing in Info.plist")
            return
        }

        let projectId = rawProjectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !isUnconfiguredSecretValue(projectId), projectId != "YOUR_PROJECT_ID" else {
            print("⚠️ USERJOT_PROJECT_ID is not configured. Set it in Info.plist.")
            return
        }

        UserJot.setup(projectId: projectId)
    }

    private func configureRevenueCat() {
        guard let rawApiKey = Bundle.main.object(forInfoDictionaryKey: Self.revenueCatApiKeyKey) as? String else {
            print("❌ REVENUECAT_API_KEY is missing in Info.plist. RevenueCat not configured.")
            return
        }

        let apiKey = rawApiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !isUnconfiguredSecretValue(apiKey), apiKey != "YOUR_REVENUECAT_API_KEY" else {
            print("❌ REVENUECAT_API_KEY is not configured. RevenueCat not configured.")
            return
        }

        #if DEBUG
        Purchases.logLevel = .debug
        #else
        Purchases.logLevel = .warn
        if apiKey.lowercased().hasPrefix("test_") {
            print("❌ Test Store API key detected in RELEASE build. RevenueCat not configured.")
            return
        }
        #endif

        if Purchases.isConfigured {
            return
        }

        Purchases.configure(withAPIKey: apiKey)
    }

    private func isUnconfiguredSecretValue(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty || (trimmed.hasPrefix("$(") && trimmed.hasSuffix(")"))
    }
}

struct ContentViewWrapper: View {
    @Environment(\.modelContext) private var modelContext

    var body: some View {
        ContentView(modelContext: modelContext)
    }
}
