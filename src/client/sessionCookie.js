import Config from "@cocreate/config";

let initialized = false;

export function setSessionCookie(token) {
    let cookie = `token=${token ? encodeURIComponent(token) : ""}; Path=/; SameSite=Lax`;
    if (window.location.protocol === "https:") cookie += "; Secure";
    if (!token) cookie += "; Max-Age=0";
    document.cookie = cookie;
}

export function initSessionCookie() {
    if (initialized) return;
    initialized = true;

    if (navigator.serviceWorker) {
        navigator.serviceWorker.addEventListener("message", (event) => {
            if (event.data?.action === "getSessionToken" && event.ports[0]) {
                event.ports[0].postMessage({ token: Config.get("token") || null });
            }
        });
    }

    const token = Config.get("token");
    if (token) setSessionCookie(token);
}
