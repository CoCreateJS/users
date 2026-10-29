import Observer from "@cocreate/observer";
import "../index.css";

const signUpSelector = '[actions*="signUp"]';
const signInSelector = '[actions*="signIn"]';
const signOutSelector = '[actions*="signOut"]';
const inviteSelector = '[actions*="inviteUser"], [actions*="acceptInvite"]';
const passwordSelector = '[actions*="forgotPassword"], [actions*="resetPassword"]';
const sessionSelector = [signOutSelector, "[session]", "[user-status]"].join(", ");

const clientSelector = [
    signUpSelector,
    signInSelector,
    inviteSelector,
    passwordSelector,
    sessionSelector
].join(", ");

function loadSignUp() {
    import(/* webpackChunkName: "users-signup" */ "./signup.js")
        .then((module) => module.init())
        .catch((error) =>
            console.error("[CoCreateUsers] Failed to load signup module.", error)
        );
}

function loadSignIn() {
    import(/* webpackChunkName: "users-signin" */ "./signin.js")
        .then((module) => module.init())
        .catch((error) =>
            console.error("[CoCreateUsers] Failed to load signin module.", error)
        );
}

function loadInvite() {
    import(/* webpackChunkName: "users-invite" */ "./invite.js")
        .then((module) => module.init())
        .catch((error) =>
            console.error("[CoCreateUsers] Failed to load invite module.", error)
        );
}

function loadPassword() {
    import(/* webpackChunkName: "users-password" */ "./password.js")
        .then((module) => module.init())
        .catch((error) =>
            console.error("[CoCreateUsers] Failed to load password module.", error)
        );
}

function loadSession() {
    import(/* webpackChunkName: "users-session" */ "./session.js")
        .then((module) => module.init())
        .catch((error) =>
            console.error("[CoCreateUsers] Failed to load session module.", error)
        );
}

function loadElement(element) {
    if (element.matches(signUpSelector)) loadSignUp();
    if (element.matches(signInSelector)) loadSignIn();
    if (element.matches(inviteSelector)) loadInvite();
    if (element.matches(passwordSelector)) loadPassword();
    if (element.matches(sessionSelector)) loadSession();
}

Observer.init([
    {
        name: "CoCreateUsersSignUpLoader",
        types: ["addedNodes", "attributes"],
        attributeFilter: ["actions"],
        selector: signUpSelector,
        callback: loadSignUp
    },
    {
        name: "CoCreateUsersSignInLoader",
        types: ["addedNodes", "attributes"],
        attributeFilter: ["actions"],
        selector: signInSelector,
        callback: loadSignIn
    },
    {
        name: "CoCreateUsersInviteLoader",
        types: ["addedNodes", "attributes"],
        attributeFilter: ["actions"],
        selector: inviteSelector,
        callback: loadInvite
    },
    {
        name: "CoCreateUsersPasswordLoader",
        types: ["addedNodes", "attributes"],
        attributeFilter: ["actions"],
        selector: passwordSelector,
        callback: loadPassword
    },
    {
        name: "CoCreateUsersSessionLoader",
        types: ["addedNodes", "attributes"],
        attributeFilter: ["actions", "session", "user-status"],
        selector: sessionSelector,
        callback: loadSession
    }
]);

document.querySelectorAll(clientSelector).forEach(loadElement);

const CoCreateUser = {
    organization_id: async () =>
        (await import("@cocreate/crud-client")).default.socket.organization_id(),
    init: () =>
        import(/* webpackChunkName: "users-session" */ "./session.js").then(
            (module) => module.init()
        ),
    signUp: (...args) =>
        import(/* webpackChunkName: "users-signup" */ "./signup.js").then(
            (module) => module.signUp(...args)
        ),
    signIn: (...args) =>
        import(/* webpackChunkName: "users-signin" */ "./signin.js").then(
            (module) => module.signIn(...args)
        ),
    inviteUser: (...args) =>
        import(/* webpackChunkName: "users-invite" */ "./invite.js").then(
            (module) => module.inviteUser(...args)
        ),
    acceptInvite: (...args) =>
        import(/* webpackChunkName: "users-invite" */ "./invite.js").then(
            (module) => module.acceptInvite(...args)
        ),
    forgotPassword: (...args) =>
        import(/* webpackChunkName: "users-password" */ "./password.js").then(
            (module) => module.forgotPassword(...args)
        ),
    resetPassword: (...args) =>
        import(/* webpackChunkName: "users-password" */ "./password.js").then(
            (module) => module.resetPassword(...args)
        ),
    signOut: (...args) =>
        import(/* webpackChunkName: "users-session" */ "./session.js").then(
            (module) => module.signOut(...args)
        ),
    setSessionCookie: (...args) =>
        import(/* webpackChunkName: "users-session" */ "./session.js").then(
            (module) => module.setSessionCookie(...args)
        ),
    updateUserStatus: (...args) =>
        import(/* webpackChunkName: "users-session" */ "./session.js").then(
            (module) => module.updateUserStatus(...args)
        ),
    redirect: (...args) =>
        import(/* webpackChunkName: "users-session" */ "./session.js").then(
            (module) => module.redirect(...args)
        ),
    initSession: (...args) =>
        import(/* webpackChunkName: "users-session" */ "./session.js").then(
            (module) => module.initSession(...args)
        ),
    initSocket: (...args) =>
        import(/* webpackChunkName: "users-session" */ "./session.js").then(
            (module) => module.default.initSocket(...args)
        )
};

export default CoCreateUser;
