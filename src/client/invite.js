import Actions from "@cocreate/actions";
import Crud from "@cocreate/crud-client";
import { render } from "@cocreate/render";

const successMessages = {
    inviteUser: "Invitation sent",
    acceptInvite: "Invitation accepted"
};

export async function inviteUser(action) {
    let email = action.form.querySelector('input[key="email"]');
    if (!email) throw new Error("An email field is required");
    email = await email.getValue();

    let name = action.form.querySelector('input[key="name"]');
    if (name) name = await name.getValue();

    let from = action.form.querySelector('input[key="from"]');
    if (from) from = await from.getValue();

    let origin = action.form.querySelector('input[key="origin"]');
    if (origin) origin = (await origin.getValue()) || window.location.origin;

    let hostname = action.form.querySelector('input[key="hostname"]');
    if (hostname)
        hostname = (await hostname.getValue()) || window.location.hostname;

    let path = action.form.querySelector('input[key="path"]');
    if (path) path = await path.getValue();

    const response = await Crud.socket.send({
        method: "inviteUser",
        name,
        email,
        from,
        origin,
        hostname,
        path
    });
    finishAction(action, response);
}

export async function acceptInvite(action) {
    let data = {
        method: "acceptInvite",
        success: false
    };

    const token = action.form.querySelector('input[key="token"]');
    if (token) data.token = await token.getValue();
    const userId = action.form.querySelector('input[key="_id"]');
    if (userId) data.user_id = await userId.getValue();
    const email = action.form.querySelector('input[key="email"]');
    if (email) data.email = await email.getValue();

    if (data.token && data.user_id) {
        data = await Crud.socket.send(data);
    } else {
        data.message = "Invitation failed";
    }

    finishAction(action, data);
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
    Actions.init([
        {
            name: "inviteUser",
            endEvent: "inviteUser",
            callback: async (action) => {
                try {
                    if (!action.form) throw new Error("A form is required");
                    await inviteUser(action);
                } catch (error) {
                    finishAction(action, {
                        success: false,
                        message:
                            error.message ||
                            "Unable to complete the request. Please try again."
                    });
                }
            }
        },
        {
            name: "acceptInvite",
            endEvent: "acceptInvite",
            callback: async (action) => {
                try {
                    if (!action.form) throw new Error("A form is required");
                    await acceptInvite(action);
                } catch (error) {
                    finishAction(action, {
                        success: false,
                        message:
                            error.message ||
                            "Unable to complete the request. Please try again."
                    });
                }
            }
        }
    ]);
}

export default { init, inviteUser, acceptInvite };
