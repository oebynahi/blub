import SwiftUI
import UserNotifications

@MainActor @Observable final class PushAlerts: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    static var current: PushAlerts?
    var pendingEvent: Int?
    var openInbox = false
    var problem: String?
    var enabled = false
    private weak var model: AppModel?
    private let defaults = UserDefaults.standard
    private var owner: String?
    private var preference: String { "push-enabled-" + (owner ?? "") }

    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey:Any]? = nil) -> Bool {
        Self.current = self
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func attach(_ model: AppModel, user: String) {
        self.model = model; owner = user; enabled = defaults.bool(forKey: preference)
        if enabled { UIApplication.shared.registerForRemoteNotifications() }
    }
    func enable() async {
        do {
            guard try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert,.sound]) else {
                problem = "Allow notifications for Blub in iPhone Settings."; return
            }
            problem = nil; defaults.set(true, forKey: preference)
            UIApplication.shared.registerForRemoteNotifications()
        } catch { problem = error.localizedDescription }
    }
    func disable() async throws {
        if let token = defaults.string(forKey: preference+"-registered-token"), let model {
            try await model.service.write(["action":"detach","token":token])
        }
        defaults.removeObject(forKey: preference+"-registered-token")
        defaults.removeObject(forKey: preference); enabled = false
        UIApplication.shared.unregisterForRemoteNotifications()
    }
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        guard let model, let owner, model.data?.me?.id == owner, defaults.bool(forKey: preference) else { return }
        let token = deviceToken.map { String(format:"%02x",$0) }.joined()
        #if DEBUG
        let environment = "sandbox"
        #else
        let environment = "production"
        #endif
        Task {
            do {
                if let old = defaults.string(forKey: preference+"-registered-token"), old != token {
                    try await model.service.write(["action":"detach","token":old])
                }
                // Keep this registration receipt for authenticated removal on sign-out.
                defaults.set(token, forKey: preference+"-registered-token")
                try await model.service.write(["action":"device","token":token,"environment":environment])
                enabled = true; problem = nil
            } catch { problem = error.localizedDescription }
        }
    }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        enabled = false; problem = error.localizedDescription
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        if let event = response.notification.request.content.userInfo["blubActivity"] as? Int {
            await MainActor.run { pendingEvent=event;openInbox = true }
        }
    }
}
