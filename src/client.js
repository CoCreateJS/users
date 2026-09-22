/*globals btoa*/
import Crud from "@cocreate/crud-client";
import Actions from "@cocreate/actions";
import Elements from "@cocreate/elements";
import { render } from "@cocreate/render";
import "@cocreate/element-prototype";
import Observer from "@cocreate/observer";
import Config from "@cocreate/config";
import "./index.css";

const CoCreateUser = {
    organization_id: async () => {
        return await Crud.socket.organization_id();
    },

    init: function () {
        if (navigator.serviceWorker) {
            navigator.serviceWorker.addEventListener("message", (event) => {
                if (event.data?.action === "getSessionToken" && event.ports[0]) {
                    event.ports[0].postMessage({ token: Config.get("token") || null });
                }
            });
        }
        this.initSocket();
        this.initSession();
        const token = Config.get("token");
        if (token) this.setSessionCookie(token);
    },

    setSessionCookie: function (token) {
        let cookie = `token=${token ? encodeURIComponent(token) : ""}; Path=/; SameSite=Lax`;
        if (window.location.protocol === "https:") cookie += "; Secure";
        if (!token) cookie += "; Max-Age=0";
        document.cookie = cookie;
    },

    initSocket: function () {
        const self = this;
        Crud.listen("updateUserStatus", (data) => self.updateUserStatus(data));
    },

    signUp: async function (action) {
        if (!action.form) throw new Error("A form is required");

        let data = await Elements.getData(action.form);
        let user = data[0];

        let userKey = {
            method: "object.create",
            array: "keys",
            object: {
                type: "user",
                key: user.object._id || user.object[0]?._id,
                roles: user.object.roles || [user.object["roles[]"]] || user.object[0]?.roles,
                email: user.object.email || user.object[0]?.email,
                password: user.object.password || window.btoa("0000"),
                array: user.array
            }
        };

        const socket = await Crud.socket.getSockets();
        if (
            !socket[0] ||
            !socket[0].connected ||
            (window && !window.navigator.onLine) ||
            Crud.socket.serverOrganization == false
        ) {
            user.method = "object.create";
            await Crud.send(user);
            let response = await Crud.send(userKey);
            this.signUpResponse({
                ...response,
                success: !response?.error && Boolean(response?.object?.[0]?._id)
            }, action);
        } else {
            let request = {
                method: "signUp",
                user,
                userKey,
                broadcastClient: false
            };

            return Crud.socket.send(request).then((response) => {
                this.signUpResponse(response, action);
            });
        }
    },

    signUpResponse: function (response, action) {
        finishAction(action, response);
    },

    signIn: async function (action) {
        if (!action.form) throw new Error("A form is required");
        let query = {};

        const inputs = action.form.querySelectorAll(
            'input[key="email"], input[key="password"], input[key="username"]'
        );
        for (let i = 0; i < inputs.length; i++) {
            const key = inputs[i].getAttribute("key");
            if (key === "password" && inputs[i].type === "text") {
                inputs[i].type = "password"
            }
            const value = await inputs[i].getValue();
            query[key] = value;
        }

        let request = {
            method: "object.read",
            array: "keys",
            filter: {
                query
            }
        };

        const socket = await Crud.socket.getSockets();
        if (
            !socket[0] ||
            !socket[0].connected ||
            (window && !window.navigator.onLine) ||
            Crud.socket.serverOrganization == false
        ) {
            return Crud.send(request).then((response) => {
                response["success"] = false;
                response["status"] = "signIn failed";
                response["message"] = "offline";
                if (response.object && response.object[0]) {
                    response["success"] = true;
                    response["status"] = "success";
                    response["user_id"] = response.object[0].key;
                }
                this.signInResponse(response, action);
            });
        } else {
            request.method = "signIn";
            request.broadcastClient = false;
            delete request.storage;
            return Crud.socket.send(request).then((response) => {
                this.signInResponse(response, action);
            });
        }
    },

    signInResponse: function (data, action) {
        let { success, status, message, organization_id, user_id, token } =
            data;
        if (success) {
            // Updated to synchronize values isomorphic-safely via our configuration manager API
            Config.set("organization_id", organization_id);
            Config.set("key", Crud.socket.key);
            Config.set("host", Crud.socket.host);
            Config.set("user_id", user_id);
            Config.set("token", token);
            this.setSessionCookie(token);
            message = message || "Successfully signed in";
            Crud.socket.user_id = user_id;
        } else if (!message) {
            message = "The email or password you entered is incorrect";
        }

        finishAction(action, { ...data, message });
    },

    signOut: function (action) {
        // Synchronously evict user configuration metadata
        Config.delete("user_id");
        Config.delete("token");
        this.setSessionCookie(null);

        if (Crud && Crud.socket) {
            Crud.socket.user_id = null;
            if (Crud.socket.token) Crud.socket.token = null;
        }

        finishAction(action, {
            success: true,
            message: "Successfully logged out"
        });
    },

    updateUserStatus: function (data) {
        if (data.user_id === Crud.socket.user_id &&
            (data.userStatus === "online" || data.userStatus === "idle")) {
            const token = Config.get("token");
            if (token) this.setSessionCookie(token);
        }
        this.redirect(data);
        let statusEls;
        if (data.user_id) {
            if (data.user_id === Crud.socket.user_id)
                statusEls = document.querySelectorAll(
                    `[user-status][object='${data["user_id"]}'], [user-status][object='$user_id']`
                );
            else
                statusEls = document.querySelectorAll(
                    `[user-status][object='${data["user_id"]}']`
                );

            statusEls.forEach((el) => {
                el.setAttribute("user-status", data["userStatus"]);
            });
        }
    },

    redirect: (data) => {
        const userStatus = data.userStatus;

        if (
            (data.user_id && data.user_id !== Crud.socket.user_id) ||
            (data.clientId && data.clientId !== Crud.socket.clientId)
        )
            return;

        let redirectTag;
        if (userStatus == "online" || userStatus == "idle") {
            redirectTag = document.querySelector('[session="true"]');
        } else if (userStatus == "offline") {
            redirectTag = document.querySelector('[session="false"]');
        }

        if (redirectTag) {
            let redirectLink = redirectTag.getAttribute("href");
            if (redirectLink) {
                if (userStatus == "offline") {
                    Config.delete("user_id");
                    Config.delete("token");
                    CoCreateUser.setSessionCookie(null);
                    if (Crud && Crud.socket) Crud.socket.user_id = null;
                }

                // Normalize both URLs to compare paths in a uniform way
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
            let sessionElements = document.querySelectorAll(
                '[session]:not([session="true"], [session="false"])'
            );
            for (let i = 0; i < sessionElements.length; i++)
                sessionElements[i].setAttribute("session", userStatus);
        }
    },

    initSession: () => {
        let redirectTag = document.querySelector("[session]");

        if (redirectTag) {
            Crud.socket.send({
                method: "checkSession",
                broadcast: false,
                broadcastSender: false,
                broadcastClient: false
            });
        }
    },

    inviteUser: async function (action) {
        let email = action.form.querySelector('input[key="email"]');
        if (!email) throw new Error("An email field is required");
        else email = await email.getValue();

        let name = action.form.querySelector('input[key="name"]');
        if (name) name = await name.getValue();

        let from = action.form.querySelector('input[key="from"]');
        if (from) from = await from.getValue();

        let origin = action.form.querySelector('input[key="origin"]');
        if (origin)
            origin = (await origin.getValue()) || window.location.origin;

        let hostname = action.form.querySelector('input[key="hostname"]');
        if (hostname)
            hostname = (await hostname.getValue()) || window.location.hostname;

        let path = action.form.querySelector('input[key="path"]');
        if (path) path = await path.getValue();

        let request = {
            method: "inviteUser",
            name,
            email,
            from,
            origin,
            hostname,
            path
        };

        const response = await Crud.socket.send(request);
        finishAction(action, response);
    },

    acceptInvite: async function (action) {
        let data = {
            method: "acceptInvite",
            success: false
        };

        let token = action.form.querySelector('input[key="token"]');
        if (token) data.token = await token.getValue();
        let user_id = action.form.querySelector('input[key="_id"]');
        if (user_id) data.user_id = await user_id.getValue();
        let email = action.form.querySelector('input[key="email"]');
        if (email) data.email = await email.getValue();

        if (data.token && data.user_id) {
            data = await Crud.socket.send(data);
        } else {
            data.message = "Invitation failed";
        }

        finishAction(action, data);
    },

    forgotPassword: async function (action) {
        let email = action.form.querySelector('input[key="email"]');
        if (!email) throw new Error("An email field is required");
        else email = await email.getValue();

        let from = action.form.querySelector('input[key="from"]');
        if (from) from = await from.getValue();

        let origin = action.form.querySelector('input[key="origin"]');
        if (origin)
            origin = (await origin.getValue()) || window.location.origin;

        let hostname = action.form.querySelector('input[key="hostname"]');
        if (hostname)
            hostname = (await hostname.getValue()) || window.location.hostname;

        let path = action.form.querySelector('input[key="path"]');
        if (path) path = await path.getValue();

        let request = {
            method: "forgotPassword",
            email,
            from,
            origin,
            hostname,
            path
        };

        const response = await Crud.socket.send(request);
        finishAction(action, response);
    },

    resetPassword: async function (action) {
        let data = {
            method: "resetPassword"
        };
        let email = action.form.querySelector('input[key="email"]');
        if (email) data.email = await email.getValue();
        else throw new Error("A email field is required");

        let password = action.form.querySelector('input[key="password"]');
        if (password) data.password = await password.getValue();
        else throw new Error("A password field is required");

        let token = action.form.querySelector('input[key="token"]');
        if (token) data.token = await token.getValue();
        else throw new Error("A token field is required");

        const response = await Crud.socket.send(data);
        finishAction(action, response);
    }
};

const successMessages = {
    signUp: "Successfully signed up",
    signIn: "Successfully signed in",
    signOut: "Successfully logged out",
    inviteUser: "Invitation sent",
    acceptInvite: "Invitation accepted",
    forgotPassword: "Password reset requested",
    resetPassword: "Password reset successful"
};

function finishAction(action, response = {}) {
    const success = response.success === true && !response.error;
    if (!success) action.abort();

    render({
        selector: '[template~="notification"]',
        data: {
            type: action.name,
            status: success ? "success" : "error",
            message: response.message || (success
                ? successMessages[action.name]
                : "Unable to complete the request. Please try again."),
            success
        }
    });

    if (success) action.end(response);
}

Actions.init(Object.keys(successMessages).map((name) => ({
    name,
    endEvent: name,
    callback: async (action) => {
        try {
            if (name !== "signOut" && !action.form) {
                throw new Error("A form is required");
            }
            await CoCreateUser[name](action);
        } catch (error) {
            finishAction(action, {
                success: false,
                message: error.message || "Unable to complete the request. Please try again."
            });
        }
    }
})));

let checkSessionTimeout;
function checkSession() {
    clearTimeout(checkSessionTimeout);
    checkSessionTimeout = setTimeout(function () {
        Crud.socket.send({
            method: "checkSession",
            broadcast: false,
            broadcastClient: false
        });
    }, 500);
}

Observer.init({
    name: "CoCreateUserSessionAddedNodes",
    types: ["addedNodes"],
    selector: "[session]",
    callback: () => {
        checkSession();
    }
});

CoCreateUser.init();

export default CoCreateUser;
