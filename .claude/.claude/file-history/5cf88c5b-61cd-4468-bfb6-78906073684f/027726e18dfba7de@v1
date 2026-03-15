import SwiftUI

//MARK: commented code are for debugs later.
struct GrockPaywallView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    
    @State private var viewModel = GrockPaywallViewModel()
    @State private var selectedFeatureIndex = 0
    @State private var purchaseTapGate = false
    @State private var appliedInitialFeatureFocus = false
    @State private var showTrialJumpCapsule = false
    @State private var trialJumpCapsuleScale: CGFloat = 0.001
    @State private var trialJumpCapsuleOpacity: Double = 0
    @State private var showCarouselChevrons = true
    @State private var isScrollAnimating = false
    @State private var lastCarouselMaxY: CGFloat = 0
    @State private var carouselGlobalMaxY: CGFloat = .greatestFiniteMagnitude
    @State private var carouselGlobalMinY: CGFloat = .greatestFiniteMagnitude
    @State private var capsuleWasDismissedByTap = false
    
    // Per-element animation state
    @State private var leftChevronScale: CGFloat = 1.0
    @State private var leftChevronOpacity: Double = 1.0
    @State private var rightChevronScale: CGFloat = 1.0
    @State private var rightChevronOpacity: Double = 1.0
    @State private var showLeftChevron = true
    @State private var showRightChevron = true
    @State private var shouldShowProCelebrationAfterDismiss = false
    @State private var showingPrivacyPolicySheet = false
    @State private var showingTermsOfServiceSheet = false
    
    // 🐛 Debug state — uncomment to enable
    // @State private var debugMinY: CGFloat = 0
    // @State private var debugMaxY: CGFloat = 0
    
    private let baselineMinY: CGFloat = 156
    private let hideThreshold: CGFloat = 126  // 156 - 30
    
    private let initialFeatureFocus: GrockPaywallFeatureFocus?
    private let celebrationContext: ProUnlockCelebrationContext?
    private let onUnlocked: (() -> Void)?
    private let trialTimelineSectionID = "paywall-trial-timeline-section"
    private let trialTimelineJumpAnchor = UnitPoint(x: 0.5, y: 0.12)
    
    init(
        initialFeatureFocus: GrockPaywallFeatureFocus? = nil,
        celebrationContext: ProUnlockCelebrationContext? = nil,
        onUnlocked: (() -> Void)? = nil
    ) {
        self.initialFeatureFocus = initialFeatureFocus
        self.celebrationContext = celebrationContext
        self.onUnlocked = onUnlocked
    }
    
    private var selectedPlanBinding: Binding<GrockPaywallPlanCardModel.Plan> {
        Binding(
            get: { viewModel.selectedPlan },
            set: { viewModel.selectedPlan = $0 }
        )
    }
    
    private var showAlertBinding: Binding<Bool> {
        Binding(
            get: { viewModel.showAlert },
            set: { viewModel.showAlert = $0 }
        )
    }
    
    private var dismissHeaderBackground: some View {
        Rectangle()
            .fill(.ultraThinMaterial)
            .mask(
                LinearGradient(
                    stops: [
                        .init(color: .white, location: 0),
                        .init(color: .white, location: 0.7),
                        .init(color: .white.opacity(0.8), location: 0.8),
                        .init(color: .white.opacity(0.4), location: 0.9),
                        .init(color: .white.opacity(0), location: 1.0)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
    }
    
    // private var debugOverlay: some View {
    //     VStack(alignment: .leading, spacing: 2) {
    //         Text("minY: \(Int(debugMinY))")
    //         Text("maxY: \(Int(debugMaxY))")
    //         Text("isScrollAnimating: \(isScrollAnimating ? "true" : "false")")
    //         Text("showChevrons: \(showLeftChevron ? "true" : "false")")
    //         Text("showCapsule: \(showTrialJumpCapsule ? "true" : "false")")
    //         Text("dismissedByTap: \(capsuleWasDismissedByTap ? "true" : "false")")
    //     }
    //     .font(.system(size: 11, weight: .medium, design: .monospaced))
    //     .foregroundStyle(.white)
    //     .padding(6)
    //     .background(.black.opacity(0.75))
    //     .clipShape(RoundedRectangle(cornerRadius: 6))
    // }
    
    private func jumpToTrialTimeline(using scrollProxy: ScrollViewProxy) {
        withAnimation(.spring(response: 0.4, dampingFraction: 0.86)) {
            scrollProxy.scrollTo(trialTimelineSectionID, anchor: trialTimelineJumpAnchor)
        }
    }
    
    private func animateAllOut() {
        let hideSpring = Animation.spring(response: 0.18, dampingFraction: 0.76)
        
        withAnimation(hideSpring) {
            leftChevronScale = 0.72
            leftChevronOpacity = 0
            rightChevronScale = 0.72
            rightChevronOpacity = 0
            trialJumpCapsuleScale = 0.72
            trialJumpCapsuleOpacity = 0
        }
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            showLeftChevron = false
            showRightChevron = false
            showTrialJumpCapsule = false
            leftChevronScale = 1.0
            rightChevronScale = 1.0
            trialJumpCapsuleScale = 1.0
        }
    }
    
    private func animateAllIn() {
        let showSpring = Animation.spring(response: 0.22, dampingFraction: 0.70, blendDuration: 0.04)
        
        showLeftChevron = true
        showRightChevron = true
        leftChevronScale = 0.72
        leftChevronOpacity = 0
        rightChevronScale = 0.72
        rightChevronOpacity = 0
        
        withAnimation(showSpring) {
            leftChevronScale = 1.0
            leftChevronOpacity = 1.0
            rightChevronScale = 1.0
            rightChevronOpacity = 1.0
        }
        
        // Always re-show capsule on scroll back (whether dismissed by tap or scroll)
        capsuleWasDismissedByTap = false
        showTrialJumpCapsule = true
        trialJumpCapsuleScale = 0.72
        trialJumpCapsuleOpacity = 0
        withAnimation(showSpring) {
            trialJumpCapsuleScale = 1.0
            trialJumpCapsuleOpacity = 1.0
        }
    }
    
    private func handleTrialJumpTap(using scrollProxy: ScrollViewProxy) {
        isScrollAnimating = true
        capsuleWasDismissedByTap = true
        jumpToTrialTimeline(using: scrollProxy)
        animateAllOut()
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            isScrollAnimating = false
            updateFloatingControlsVisibility(minY: carouselGlobalMinY)
        }
    }
    
    private func selectPreviousFeature() {
        let featureCount = viewModel.features.count
        guard featureCount > 1 else { return }
        withAnimation(.spring(response: 0.3, dampingFraction: 0.82)) {
            selectedFeatureIndex = (selectedFeatureIndex - 1 + featureCount) % featureCount
        }
    }
    
    private func selectNextFeature() {
        let featureCount = viewModel.features.count
        guard featureCount > 1 else { return }
        withAnimation(.spring(response: 0.3, dampingFraction: 0.82)) {
            selectedFeatureIndex = (selectedFeatureIndex + 1) % featureCount
        }
    }
    
    private func updateFloatingControlsVisibility(minY: CGFloat) {
        lastCarouselMaxY = carouselGlobalMaxY
        guard !isScrollAnimating else { return }
        
        let shouldShow = minY > hideThreshold
        
        if shouldShow && !showLeftChevron {
            animateAllIn()
        } else if !shouldShow && showLeftChevron {
            animateAllOut()
        }
    }
    
    private func chevronButton(systemName: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.black)
                .frame(width: 36, height: 36)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var shouldShowOfferingsFallback: Bool {
        viewModel.shouldShowOfferingsLoadingState || viewModel.shouldShowOfferingsUnavailableState
    }

    private var offeringsFallbackSection: some View {
        VStack(spacing: 14) {
            Image(systemName: viewModel.shouldShowOfferingsLoadingState ? "hourglass" : "wifi.exclamationmark")
                .font(.system(size: 30, weight: .semibold))
                .foregroundStyle(.black.opacity(0.75))

            Text(viewModel.shouldShowOfferingsLoadingState ? "Loading Grock Pro plans..." : viewModel.offeringsUnavailableTitle)
                .lexend(.title3, weight: .semibold)
                .foregroundStyle(.black)
                .multilineTextAlignment(.center)

            if !viewModel.shouldShowOfferingsLoadingState {
                Text(viewModel.offeringsUnavailableMessage)
                    .lexend(.subheadline, weight: .regular)
                    .foregroundStyle(.black.opacity(0.72))
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if viewModel.shouldShowOfferingsLoadingState {
                ProgressView()
                    .progressViewStyle(.circular)
                    .tint(.black)
            } else {
                Button {
                    Task { @MainActor in
                        await viewModel.retryOfferingsLoad()
                        applyInitialFeatureFocusIfNeeded()
                    }
                } label: {
                    Text("Retry")
                        .lexend(.subheadline, weight: .semibold)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                        .background(
                            Capsule()
                                .fill(Color.black.opacity(0.86))
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 16)
        .padding(.vertical, 22)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(.white.opacity(0.9))
                .overlay(
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .stroke(Color.black.opacity(0.08), lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.10), radius: 14, x: 0, y: 6)
        )
        .padding(.horizontal, 16)
        .padding(.top, 10)
    }

    private var connectionWarningBanner: some View {
        HStack(spacing: 8) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 12, weight: .semibold))
            Text(viewModel.connectionWarningMessage)
                .lexend(.footnote, weight: .medium)
                .lineLimit(2)
        }
        .foregroundStyle(.black.opacity(0.82))
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            Capsule()
                .fill(.white.opacity(0.88))
                .overlay(
                    Capsule()
                        .stroke(Color.black.opacity(0.10), lineWidth: 1)
                )
        )
        .padding(.horizontal, 20)
        .padding(.top, 6)
    }
    
    var body: some View {
        Group {
            if viewModel.isProUser {
                Color.clear
                    .ignoresSafeArea()
                    .onAppear {
                        dismiss()
                    }
            } else {
                ScrollViewReader { scrollProxy in
                    ZStack {
                LinearGradient(
                    stops: [
                        .init(color: Color(hex: "FFFFFF"), location: 0.0),
                        .init(color: Color(hex: "FFFFFF"), location: 0.2),
                        .init(color: Color(hex: "FFFBEA"), location: 0.4),
                        .init(color: Color(hex: "FFF2C8"), location: 0.55),
                        .init(color: Color(hex: "FFE79A"), location: 0.68),
                        .init(color: Color(hex: "FFD966"), location: 0.82),
                        .init(color: Color(hex: "FFC94A"), location: 1.0)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()
                
                GeometryReader { geo in
                    Image("sub_background")
                        .resizable()
                        .scaledToFill()
                        .frame(width: geo.size.width, height: geo.size.height)
                        .clipped()
                }
                .ignoresSafeArea()
                
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .center, spacing: 18) {
                        GrockPaywallTopHeaderView()

                        if shouldShowOfferingsFallback {
                            offeringsFallbackSection
                        } else {
                            if viewModel.shouldShowConnectionWarningBanner {
                                connectionWarningBanner
                            }

                            GrockPaywallFeatureCarouselSectionView(
                                features: viewModel.features,
                                selectedIndex: $selectedFeatureIndex,
                                onManualInteraction: {}
                            )
                            .padding(.horizontal, 20)
                            .background(
                                GeometryReader { proxy in
                                    let minY = proxy.frame(in: .global).minY
                                    let maxY = proxy.frame(in: .global).maxY
                                    
                                    Color.clear
                                        .preference(
                                            key: PaywallCarouselMaxYPreferenceKey.self,
                                            value: maxY
                                        )
                                        .onChange(of: minY) { _, newVal in
                                            // debugMinY = newVal
                                            carouselGlobalMinY = newVal
                                        }
                                        .onChange(of: maxY) { _, newVal in
                                            // debugMaxY = newVal
                                            carouselGlobalMaxY = newVal
                                        }
                                }
                            )
                            
                            if viewModel.showsTrialMessaging {
                                GrockPaywallTrialTimelineView(
                                    items: viewModel.trialTimelineItems,
                                    summaryText: viewModel.selectedPlanSummaryText
                                )
                                .padding(.horizontal, 16)
                                .id(trialTimelineSectionID)
                                
                                VStack(spacing: 2) {
                                    Text("✓ No payment today")
                                    Text("Cancel anytime!")
                                }
                                .frame(width: UIScreen.main.bounds.size.width * 0.7)
                                .lexend(.subheadline, weight: .medium)
                                .foregroundStyle(.black)
                                .fixedSize(horizontal: false, vertical: true)
                                .multilineTextAlignment(.center)
                                .lineLimit(2)
                                .padding(.top, 16)
                            }
                        }
                        
                    
                    }
                    .padding(.top, 32)
                    .padding(.bottom, 300)
                }
                .coordinateSpace(name: "paywallScroll")
            }
            .overlay(alignment: .top) {
                GeometryReader { geo in
                    let topSafeAreaInset = geo.safeAreaInsets.top
                    
                    ZStack(alignment: .topLeading) {
                        dismissHeaderBackground
                            .frame(height: topSafeAreaInset + 40)
                            .frame(maxWidth: .infinity)
                            .ignoresSafeArea(edges: .top)
                        
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(.black)
                            .frame(width: 36, height: 36)
                            .contentShape(Rectangle())
                            .padding(.leading, 16)
                            .onTapGesture {
                                dismiss()
                            }
                        
                        // 🐛 Debug overlay — uncomment to enable (also uncomment debugOverlay var and debug state above)
                        // debugOverlay
                        //     .frame(maxWidth: .infinity, alignment: .trailing)
                        //     .padding(.trailing, 12)
                        //     .padding(.top, topSafeAreaInset + 4)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                }
            }
            .overlay(alignment: .bottom) {
                VStack(spacing: 6) {
                    if !shouldShowOfferingsFallback {
                        ZStack {
                            // Capsule — centered
                            if showTrialJumpCapsule && viewModel.showsTrialMessaging {
                                GrockPaywallTimelineJumpCapsuleView {
                                    handleTrialJumpTap(using: scrollProxy)
                                }
                                .scaleEffect(trialJumpCapsuleScale)
                                .opacity(trialJumpCapsuleOpacity)
                            }
                            
                            if showLeftChevron {
                                HStack {
                                    chevronButton(systemName: "chevron.left", action: selectPreviousFeature)
                                        .padding(.leading, 20)
                                        .scaleEffect(leftChevronScale, anchor: .leading)
                                        .opacity(leftChevronOpacity)
                                    Spacer()
                                }
                            }
                            
                            if showRightChevron {
                                HStack {
                                    Spacer()
                                    chevronButton(systemName: "chevron.right", action: selectNextFeature)
                                        .padding(.trailing, 20)
                                        .scaleEffect(rightChevronScale, anchor: .trailing)
                                        .opacity(rightChevronOpacity)
                                }
                            }
                        }
                        .frame(maxWidth: .infinity)
                    }
                    
                    GrockPaywallStickyBottomPanelView(
                        planCards: viewModel.planCards,
                        selectedPlan: selectedPlanBinding,
                        selectedPlanContextPrimaryLine: viewModel.stickyPanelPrimaryLine,
                        selectedPlanContextSecondaryLine: viewModel.stickyPanelSecondaryLine,
                        isProcessingAction: viewModel.isProcessingAction || purchaseTapGate,
                        isPrimaryActionEnabled: viewModel.isPrimaryActionEnabled && !purchaseTapGate,
                        primaryButtonTitle: viewModel.primaryButtonTitle,
                        onPrimaryAction: handlePrimaryAction,
                        onRestore: handleRestore,
                        onTerms: openTerms,
                        onPrivacy: openPrivacy
                    )
                }
            }
            .onAppear {
                applyInitialFeatureFocusIfNeeded()
                showLeftChevron = true
                showRightChevron = true
                showTrialJumpCapsule = false
                leftChevronScale = 0.72
                leftChevronOpacity = 0
                rightChevronScale = 0.72
                rightChevronOpacity = 0
                
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
                    showTrialJumpCapsule = true
                    trialJumpCapsuleScale = 0.72
                    trialJumpCapsuleOpacity = 0
                    
                    withAnimation(.spring(response: 0.22, dampingFraction: 0.70, blendDuration: 0.04)) {
                        leftChevronScale = 1.0
                        leftChevronOpacity = 1.0
                        rightChevronScale = 1.0
                        rightChevronOpacity = 1.0
                        trialJumpCapsuleScale = 1.0
                        trialJumpCapsuleOpacity = 1.0
                    }
                }

                #if DEBUG
                print("ℹ️ [Paywall] If you switched Sandbox testers, reinstall the app before validating storefront pricing to clear cached session data.")
                #endif

                Task { @MainActor in
                    guard await verifyPaywallEligibility() else { return }
                    await refreshOfferingsForVisiblePaywall(reason: "paywall-appeared")
                }
            }
            .onChange(of: scenePhase) { _, newPhase in
                guard newPhase == .active else { return }
                Task { @MainActor in
                    guard await verifyPaywallEligibility() else { return }
                    await refreshOfferingsForVisiblePaywall(reason: "app-became-active")
                }
            }
            .onChange(of: carouselGlobalMinY) { _, newVal in
                updateFloatingControlsVisibility(minY: newVal)
            }
            .onDisappear {
                if shouldShowProCelebrationAfterDismiss {
                    var userInfo: [AnyHashable: Any] = [:]
                    if let featureFocus = initialFeatureFocus {
                        userInfo["featureFocus"] = featureFocus.rawValue
                    }
                    if let celebrationContext {
                        userInfo["celebrationContext"] = celebrationContext.rawValue
                    }
                    NotificationCenter.default.post(
                        name: .showProUnlockedCelebration,
                        object: nil,
                        userInfo: userInfo.isEmpty ? nil : userInfo
                    )
                }
                shouldShowProCelebrationAfterDismiss = false
                showTrialJumpCapsule = false
                showLeftChevron = true
                showRightChevron = true
                appliedInitialFeatureFocus = false
                leftChevronScale = 1.0
                leftChevronOpacity = 1.0
                rightChevronScale = 1.0
                rightChevronOpacity = 1.0
                trialJumpCapsuleScale = 1.0
                trialJumpCapsuleOpacity = 1.0
                capsuleWasDismissedByTap = false
            }
            .alert("Subscription", isPresented: showAlertBinding) {
                Button("OK", role: .cancel) { }
            } message: {
                Text(viewModel.alertMessage)
            }
            .sheet(isPresented: $showingTermsOfServiceSheet) {
                LegalDocumentSheet(document: .termsOfService)
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
            }
            .sheet(isPresented: $showingPrivacyPolicySheet) {
                LegalDocumentSheet(document: .privacyPolicy)
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
            }
                }
            }
        }
    }
    
    private func handlePrimaryAction() {
        guard !purchaseTapGate else { return }
        purchaseTapGate = true
        
        Task { @MainActor in
            defer { purchaseTapGate = false }
            let unlocked = await viewModel.purchaseSelectedPlan()
            if unlocked {
                shouldShowProCelebrationAfterDismiss = true
                onUnlocked?()
                dismiss()
            }
        }
    }
    
    private func handleRestore() {
        Task {
            let restored = await viewModel.restorePurchases()
            if restored {
                shouldShowProCelebrationAfterDismiss = true
                onUnlocked?()
                dismiss()
            }
        }
    }
    
    private func openTerms() {
        showingTermsOfServiceSheet = true
    }
    
    private func openPrivacy() {
        showingPrivacyPolicySheet = true
    }
    
    private func applyInitialFeatureFocusIfNeeded() {
        guard !appliedInitialFeatureFocus else { return }
        appliedInitialFeatureFocus = true
        
        guard let initialFeatureFocus else { return }
        guard let focusedFeatureIndex = viewModel.features.firstIndex(where: { $0.id == initialFeatureFocus.rawValue }) else { return }
        
        selectedFeatureIndex = focusedFeatureIndex
    }

    @MainActor
    private func refreshOfferingsForVisiblePaywall(reason: String) async {
        await viewModel.refreshOfferingsForPaywall(reason: reason)
        applyInitialFeatureFocusIfNeeded()
    }

    @MainActor
    private func verifyPaywallEligibility() async -> Bool {
        if viewModel.isProUser {
            dismiss()
            return false
        }

        let isProAfterRefresh = await viewModel.refreshEntitlementForPaywallGate()
        if isProAfterRefresh {
            dismiss()
            return false
        }

        return true
    }
}

private struct PaywallCarouselMaxYPreferenceKey: PreferenceKey {
    static var defaultValue: CGFloat = .greatestFiniteMagnitude
    
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

#Preview("Paywall Full") {
    GrockPaywallView()
}
