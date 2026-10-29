import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const loaderSource = readFileSync(
    new URL("../src/client/index.js", import.meta.url),
    "utf8"
);
const featureFiles = {
    signUp: ["signup.js", "signUp"],
    signIn: ["signin.js", "signIn"],
    signOut: ["session.js", "signOut"],
    inviteUser: ["invite.js", "inviteUser"],
    acceptInvite: ["invite.js", "acceptInvite"],
    forgotPassword: ["password.js", "forgotPassword"],
    resetPassword: ["password.js", "resetPassword"]
};

function evaluateModule(file, exports, dependencies) {
    const source = readFileSync(new URL(`../src/client/${file}`, import.meta.url), "utf8")
        .split("\nexport default")[0]
        .replace(/^import .*;$/gm, "")
        .replace(/\bexport\s+/g, "");
    const context = vm.createContext(dependencies);
    vm.runInContext(
        `${source}\nthis.moduleExports = { ${exports.join(", ")} };`,
        context,
        { filename: file }
    );
    return context.moduleExports;
}

function createField(key) {
    return {
        type: key === "password" ? "password" : "text",
        getAttribute: () => key,
        getValue: async () => {
            const values = {
                email: "test@example.com",
                password: "secret",
                token: "token-1",
                _id: "user-1",
                name: "Test User",
                from: "sender@example.com",
                origin: "",
                hostname: "",
                path: ""
            };
            return values[key];
        }
    };
}

function createForm() {
    const fields = new Map(
        [
            "email",
            "password",
            "username",
            "token",
            "_id",
            "name",
            "from",
            "origin",
            "hostname",
            "path"
        ].map((key) => [key, createField(key)])
    );
    const keysInSelector = (selector) =>
        [...selector.matchAll(/key="([^"]+)"/g)].map((match) => match[1]);

    return {
        querySelector: (selector) => fields.get(keysInSelector(selector)[0]) || null,
        querySelectorAll: (selector) =>
            keysInSelector(selector)
                .map((key) => fields.get(key))
                .filter(Boolean)
    };
}

function setup(name, response, rejected = false, offline = false) {
    let actions;
    const notifications = [];
    const config = new Map();
    const send = async () => {
        if (rejected) throw new Error("Connection failed");
        return response;
    };
    const [file, method] = featureFiles[name];
    const feature = evaluateModule(file, ["init", method], {
        Actions: {
            init: (value) => {
                actions = Array.isArray(value) ? value : [value];
            }
        },
        render: (value) => notifications.push(value),
        Crud: {
            send,
            listen: () => {},
            socket: {
                send,
                getSockets: async () => [{ connected: !offline }],
                key: "key-1",
                host: "localhost"
            }
        },
        Elements: {
            getData: async () => [
                {
                    array: "contacts",
                    object: { email: "test@example.com", password: "secret" }
                }
            ]
        },
        Config: {
            get: (key) => config.get(key),
            set: (key, value) => config.set(key, value),
            delete: (key) => config.delete(key)
        },
        Observer: { init: () => {} },
        initSessionCookie: () => {},
        setSessionCookie: () => {},
        document: {
            cookie: "",
            querySelector: () => null,
            querySelectorAll: () => []
        },
        navigator: { onLine: !offline },
        window: {
            navigator: { onLine: !offline },
            location: {
                protocol: "https:",
                origin: "https://example.com",
                hostname: "example.com"
            }
        },
        location: { href: "https://example.com/" },
        URL
    });
    feature.init();

    return { actions, notifications, config };
}

test("registers one observer selector for each client action", () => {
    for (const [selector, loader] of [
        ["signUpSelector", "loadSignUp"],
        ["signInSelector", "loadSignIn"],
        ["inviteUserSelector", "loadInvite"],
        ["acceptInviteSelector", "loadInvite"],
        ["forgotPasswordSelector", "loadPassword"],
        ["resetPasswordSelector", "loadPassword"],
        ["signOutSelector", "loadSession"],
        ["sessionSelector", "loadSession"],
        ["userStatusSelector", "loadSession"]
    ]) {
        assert.match(
            loaderSource,
            new RegExp(`selector: ${selector},\\s*callback: ${loader}`)
        );
    }
});

test("queries existing elements once and selects modules by matching selector", () => {
    assert.match(
        loaderSource,
        /document\.querySelectorAll\(clientSelector\)\.forEach\(loadElement\)/
    );
    assert.match(loaderSource, /element\.matches\(signUpSelector\)/);
    assert.match(loaderSource, /element\.matches\(signInSelector\)/);
    assert.match(loaderSource, /element\.matches\(inviteUserSelector\)/);
    assert.match(loaderSource, /element\.matches\(forgotPasswordSelector\)/);
    assert.match(loaderSource, /element\.matches\(sessionSelector\)/);
});

for (const name of Object.keys(featureFiles)) {
    for (const success of name === "signOut" ? [true] : [true, false]) {
        test(`${name} ${success ? "ends" : "aborts"} and renders a notification`, async () => {
            const response = {
                success,
                message: "Server message",
                user_id: "user-1",
                token: "session"
            };
            const { actions, notifications, config } = setup(name, response);
            let ended = 0;
            let aborted = 0;
            await actions.find((action) => action.name === name).callback({
                name,
                form: createForm(),
                end: (detail) => {
                    ended++;
                    assert.equal(detail.success, true);
                    if (name === "signIn") assert.equal(config.get("user_id"), "user-1");
                    assert.equal(notifications.length, 1);
                },
                abort: () => aborted++
            });
            assert.equal(ended, Number(success));
            assert.equal(aborted, Number(!success));
            assert.equal(notifications[0].selector, '[template~="notification"]');
            assert.equal(notifications[0].data.status, success ? "success" : "error");
            if (name !== "signOut") {
                assert.equal(notifications[0].data.message, "Server message");
            }
        });
    }

    if (name === "signOut") continue;
    test(`${name} aborts a rejected request`, async () => {
        const { actions, notifications } = setup(name, {}, true);
        let aborted = 0;
        await actions.find((action) => action.name === name).callback({
            name,
            form: createForm(),
            end: () => assert.fail("Must not advance"),
            abort: () => aborted++
        });
        assert.equal(aborted, 1);
        assert.equal(notifications[0].data.message, "Connection failed");
    });
}

test("offline signup ends when the credential record is created", async () => {
    const { actions } = setup("signUp", { object: [{ _id: "key-1" }] }, false, true);
    let ended = false;
    await actions.find((action) => action.name === "signUp").callback({
        name: "signUp",
        form: createForm(),
        end: () => {
            ended = true;
        },
        abort: () => assert.fail("Must succeed")
    });
    assert.equal(ended, true);
});
