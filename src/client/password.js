import Actions from "@cocreate/actions";
import { crudClient as Crud } from '@cocreate/crud/client';
import { render } from "@cocreate/render";

const successMessages = {
    forgotPassword: "Password reset requested",
    resetPassword: "Password reset successful"
};

export async function forgotPassword(action) {
    let email = action.form.querySelector('input[key="email"]');
    if (!email) throw new Error("An email field is required");
    email = await email.getValue();

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
        method: "forgotPassword",
        email,
        from,
        origin,
        hostname,
        path
    });
    finishAction(action, response);
}

export async function resetPassword(action) {
    const data = { method: "resetPassword" };
    const email = action.form.querySelector('input[key="email"]');
    if (email) data.email = await email.getValue();
    else throw new Error("A email field is required");

    const password = action.form.querySelector('input[key="password"]');
    if (password) data.password = await password.getValue();
    else throw new Error("A password field is required");

    const token = action.form.querySelector('input[key="token"]');
    if (token) data.token = await token.getValue();
    else throw new Error("A token field is required");

    const response = await Crud.socket.send(data);
    finishAction(action, response);
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
            name: "forgotPassword",
            endEvent: "forgotPassword",
            callback: async (action) => {
                try {
                    if (!action.form) throw new Error("A form is required");
                    await forgotPassword(action);
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
            name: "resetPassword",
            endEvent: "resetPassword",
            callback: async (action) => {
                try {
                    if (!action.form) throw new Error("A form is required");
                    await resetPassword(action);
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

export default { init, forgotPassword, resetPassword };
