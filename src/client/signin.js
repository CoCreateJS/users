import Actions from "@cocreate/actions";
import { crudClient as Crud } from '@cocreate/crud/client';
import Config from "@cocreate/config";
import { render } from "@cocreate/render";
import { initSessionCookie, setSessionCookie } from "./sessionCookie.js";

const successMessages = {
    signIn: "Successfully signed in"
};

export async function signIn(action) {
    if (!action.form) throw new Error("A form is required");
    const query = {};

    const inputs = action.form.querySelectorAll(
        'input[key="email"], input[key="password"], input[key="username"]'
    );
    for (let i = 0; i < inputs.length; i++) {
        const key = inputs[i].getAttribute("key");
        if (key === "password" && inputs[i].type === "text") {
            inputs[i].type = "password";
        }
        query[key] = await inputs[i].getValue();
    }

    const request = {
        method: "object.read",
        array: "keys",
        filter: { query }
    };

    const socket = await Crud.socket.getSockets();
    if (
        !socket[0] ||
        !socket[0].connected ||
        !window.navigator.onLine ||
        Crud.socket.serverOrganization == false
    ) {
        const response = await Crud.send(request);
        response.success = false;
        response.status = "signIn failed";
        response.message = "offline";
        if (response.object && response.object[0]) {
            response.success = true;
            response.status = "success";
            response.user_id = response.object[0].key;
        }
        signInResponse(response, action);
    } else {
        request.method = "signIn";
        request.broadcastClient = false;
        delete request.storage;
        const response = await Crud.socket.send(request);
        signInResponse(response, action);
    }
}

function signInResponse(data, action) {
    let { success, message, organization_id, user_id, token } = data;
    if (success) {
        Config.set("organization_id", organization_id);
        Config.set("key", Crud.socket.key);
        Config.set("host", Crud.socket.host);
        Config.set("user_id", user_id);
        Config.set("token", token);
        setSessionCookie(token);
        message = message || "Successfully signed in";
        Crud.socket.user_id = user_id;
    } else if (!message) {
        message = "The email or password you entered is incorrect";
    }

    finishAction(action, { ...data, message });
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
    initSessionCookie();
    Actions.init({
        name: "signIn",
        endEvent: "signIn",
        callback: async (action) => {
            try {
                if (!action.form) throw new Error("A form is required");
                await signIn(action);
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
}

export default { init, signIn };
