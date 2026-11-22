import SwiftUI
import WebKit

struct HostedAccount: UIViewRepresentable {
    let url: URL
    let reachedFeed: () -> Void
    @Binding var problem: String?

    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> WKWebView {
        let web = WKWebView()
        web.navigationDelegate = context.coordinator
        web.uiDelegate = context.coordinator
        web.load(URLRequest(url: url))
        return web
    }
    func updateUIView(_ web: WKWebView, context: Context) {}

    class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let owner: HostedAccount
        init(_ owner: HostedAccount) { self.owner = owner }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            if let url = webView.url, url.scheme == "https", url.host == BlubService.site.host,
               url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/")) == "feed" {
                owner.reachedFeed()
            }
        }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            if (error as NSError).code != NSURLErrorCancelled { owner.problem = error.localizedDescription }
        }
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if navigationAction.targetFrame == nil, navigationAction.request.url?.scheme == "https" {
                webView.load(navigationAction.request)
            }
            return nil
        }
    }
}
