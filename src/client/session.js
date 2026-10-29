import Actions from "@cocreate/actions";
import Observer from "@cocreate/observer";
import Crud from "@cocreate/crud-client";
import Config from "@cocreate/config";
import { render } from "@cocreate/render";
import { initSessionCookie, setSessionCookie } from "./sessionCookie.js";

const successMessages = {
    signOut: "Successfully logged out"
};

let initialized = false;
let checkSessionTimeout;

export function signOut(action) {
    Config.delete("user_id");
    Config.delete("token");
    setSessionCookie(null);

    if (Crud && Crud.socket) {
        Crud.socket.user_id = null;
        if (Crud.socket.token) Crud.socket.token = null;
    }

    finishAction(action, {
        success: true,
        message: "Successfully logged out"
    });
}

export function updateUserStatus(data) {
    if (
        data.user_id === Crud.socket.user_id &&
        (data.userStatus === "online" || data.userStatus === "idle")
    ) {
        const token = Config.get("token");
        if (token) setSessionCookie(token);
    }
    redirect(data);

    if (data.user_id) {
        let statusEls;
        if (data.user_id === Crud.socket.user_id) {
            statusEls = document.querySelectorAll(
                `[user-status][object='${data.user_id}'], [user-status][object='$user_id']`
            );
        } else {
            statusEls = document.querySelectorAll(
                `[user-status][object='${data.user_id}']`
            );
        }

        statusEls.forEach((element) => {
            element.setAttribute("user-status", data.userStatus);
        });
    }
}

export function redirect(data) {
    const userStatus = data.userStatus;

    if (
        (data.user_id && data.user_id !== Crud.socket.user_id) ||
        (data.clientId && data.clientId !== Crud.socket.clientId)
    ) {
        return;
    }

    let redirectTag;
    if (userStatus == "online" || userStatus == "idle") {
        redirectTag = document.querySelector('[session="true"]');
    } else if (userStatus == "offline") {
        redirectTag = document.querySelector('[session="false"]');
    }

    if (redirectTag) {
        const redirectLink = redirectTag.getAttribute("href");
        if (redirectLink) {
            if (userStatus == "offline") {
                Config.delete("user_id");
                Config.delete("token");
                setSessionCookie(null);
                if (Crud && Crud.socket) Crud.socket.user_id = null;
            }

            const currentPath = new URL(location.href).pathname.replace(
                "/index.html",
                "/"
            );
            const targetPath = new URL(
                redirectLink,
                location.href
            ).pathname.replace("/index.html", "/");

            if (currentPath !== targetPath) {
                location.href = redirectLink;
            }
        }
    }

    if (userStatus) {
        const sessionElements = document.querySelectorAll(
            '[session]:not([session="true"], [session="false"])'
        );
        for (let i = 0; i < sessionElements.length; i++) {
            sessionElements[i].setAttribute("session", userStatus);
        }
    }
}

export function initSession() {
    if (document.querySelector("[session]")) {
        Crud.socket.send({
            method: "checkSession",
            broadcast: false,
            broadcastSender: false,
            broadcastClient: false
        });
    }
}

function checkSession() {
    clearTimeout(checkSessionTimeout);
    checkSessionTimeout = setTimeout(() => {
        Crud.socket.send({
            method: "checkSession",
            broadcast: false,
            broadcastClient: false
        });
    }, 500);
}

function finishAction(action, response = {}) {
    const success = response.success === true && !response.error;
    if (!success) action.abort();

    render({
        selector: '[template~="notification"]',
        data: {
            type: action.name,
            status: success ? "success" : "error",
            message:
                response.message ||
                (success
                    ? successMessages[action.name]
                    : "Unable to complete the request. Please try again."),
            success
        }
    });

    if (success) action.end(response);
}

export function init() {
    if (initialized) return;
    initialized = true;

    initSessionCookie();
    Crud.listen("updateUserStatus", updateUserStatus);
    Actions.init({
        name: "signOut",
        endEvent: "signOut",
        callback: async (action) => {
            try {
                signOut(action);
            } catch (error) {
                finishAction(action, {
                    success: false,
                    message:
                        error.message ||
                        "Unable to complete the request. Please try again."
                });
            }
        }
    });
    initSession();
    Observer.init({
        name: "CoCreateUserSessionAddedNodes",
        types: ["addedNodes"],
        selector: "[session]",
        callback: () => checkSession()
    });
}

export default {
    init,
    setSessionCookie,
    signOut,
    updateUserStatus,
    redirect,
    initSession,
    initSocket: () => Crud.listen("updateUserStatus", updateUserStatus)
};
