import Actions from "@cocreate/actions";
import { crudClient as Crud } from '@cocreate/crud/client';
import Elements from "@cocreate/elements";
import { render } from "@cocreate/render";

const successMessages = {
    signUp: "Successfully signed up"
};

export async function signUp(action) {
    if (!action.form) throw new Error("A form is required");

    const data = await Elements.getData(action.form);
    const user = data[0];
    if (!user) throw new Error("No user data was found in the signup form");

    const userObject = Array.isArray(user.object)
        ? (user.object[0] ||= {})
        : (user.object ||= {});
    const credentials = {};
    const credentialInputs = action.form.querySelectorAll(
        'input[key="email"], input[key="password"]'
    );
    for (const input of credentialInputs) {
        const key = input.getAttribute("key");
        if (key === "password" && input.type === "text") {
            input.type = "password";
        }
        credentials[key] = await input.getValue();
    }
    Object.assign(userObject, credentials);

    if (!credentials.email || !credentials.password) {
        throw new Error("Email and password are required for signup");
    }

    const userKey = {
        method: "object.create",
        array: "keys",
        object: {
            type: "user",
            key: userObject._id,
            roles: userObject.roles || [userObject["roles[]"]],
            email: credentials.email,
            password: credentials.password,
            array: user.array
        }
    };

    const socket = await Crud.socket.getSockets();
    if (
        !socket[0] ||
        !socket[0].connected ||
        !window.navigator.onLine ||
        Crud.socket.serverOrganization == false
    ) {
        user.method = "object.create";
        await Crud.send(user);
        const response = await Crud.send(userKey);
        finishAction(
            action,
            {
                ...response,
                success: !response?.error && Boolean(response?.object?.[0]?._id)
            }
        );
    } else {
        const request = {
            method: "signUp",
            user,
            userKey,
            broadcastClient: false
        };
        const response = await Crud.socket.send(request);
        finishAction(action, response);
    }
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
    Actions.init({
        name: "signUp",
        endEvent: "signUp",
        callback: async (action) => {
            try {
                if (!action.form) throw new Error("A form is required");
                await signUp(action);
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

export default { init, signUp };
