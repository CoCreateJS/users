/*globals CustomEvent, btoa*/
import Crud from "@cocreate/crud-client";
import Actions from "@cocreate/actions";
import Elements from "@cocreate/elements";
import { render } from "@cocreate/render";
import "@cocreate/element-prototype";
import Observer from "@cocreate/observer";
import "./index.css";

// TODO: Replace with @cocreate/config.
import localStorage from "@cocreate/local-storage";
import Config from "@cocreate/config";

const CoCreateUser = {
	organization_id: async () => {
		return await Crud.socket.organization_id();
	},

	init: function () {
		this.initSocket();
		this.initSession();
	},

	initSocket: function () {
		const self = this;
		Crud.listen("updateUserStatus", (data) => self.updateUserStatus(data));
	},

	signUp: async function (action) {
		if (!action.form) return;

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
			if (response && response.object && response.object[0]) {
				this.signUpResponse(response, action);
			}
		} else {
			let request = {
				method: "signUp",
				user,
				userKey,
				broadcastBrowser: false
			};
			
			Crud.socket.send(request).then((response) => {
				this.signUpResponse(response, action);
			});
		}
	},

	signUpResponse: function (response, action) {
		render({
			selector: "[template*='signUp']",
			data: [
				{
					type: "signUp",
					message: "Succesfully Signed Up",
					success: true
				}
			]
		});

		action.element.dispatchEvent(
			new CustomEvent("signUp", {
				detail: response
			})
		);
	},

	signIn: async function (action) {
		if (!action.form) return;
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
			$filter: {
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
			Crud.send(request).then((response) => {
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
			request.broadcastBrowser = false;
			delete request.storage;
			Crud.socket.send(request).then((response) => {
				this.signInResponse(response, action);
			});
		}
	},

	signInResponse: function (data, action) {
		let { success, status, message, organization_id, user_id, token } =
			data;
		if (success) {
			localStorage.setItem("organization_id", organization_id);
			localStorage.setItem("key", Crud.socket.key);
			localStorage.setItem("host", Crud.socket.host);
			localStorage.setItem("user_id", user_id);
			localStorage.setItem("token", token);
			message = "Successful signIn";
			Crud.socket.user_id = user_id;
		} else if (!message) {
			message = "The email or password you entered is incorrect";
		}

		render({
			selector: "[template*='signIn']",
			data: [
				{
					type: "signIn",
					status,
					message,
					success
				}
			]
		});

		action.element.dispatchEvent(
			new CustomEvent("signIn", {
				detail: {}
			})
		);

	},

		signOut: function (action) {
		// Remove user_id via Config to clear cookies and CoCreateConfig
		Config.remove("user_id");
		// token can remain in localStorage removal
		localStorage.removeItem("token");
		if (Crud && Crud.socket) {
			Crud.socket.user_id = null;
			if (Crud.socket.token) Crud.socket.token = null;
		}

		render({
			selector: "[template*='signOut']",
			data: [
				{
					type: "signOut",
					message: "Succesfully logged out",
					success: true
				}
			]
		});

		action.element.dispatchEvent(new CustomEvent("signOut"));
	},

	updateUserStatus: function (data) {
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
					Config.removeItem("user_id");
					localStorage.removeItem("token");
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
				broadcastBrowser: false
			});
		}
	},

	inviteUser: async function (action) {
		let email = action.form.querySelector('input[key="email"]');
		if (!email) return;
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

		Crud.socket.send(request).then((response) => {
			if (response.success)
				action.element.dispatchEvent(new CustomEvent("inviteUser"));

			render({
				selector: "[template*='inviteUser']",
				data: [
					{
						type: "inviteUser",
						message: response.message,
						success: response.success
					}
				]
			});
		});
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

		if (data.success)
			action.element.dispatchEvent(new CustomEvent("acceptInvite"));
		render({
			selector: "[template*='acceptInvite']",
			data: [
				{
					type: "acceptInvite",
					message: data.message,
					success: data.success
				}
			]
		});
	},

	forgotPassword: async function (action) {
		let email = action.form.querySelector('input[key="email"]');
		if (!email) return;
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

		Crud.socket.send(request).then((response) => {
			if (response.success)
				action.element.dispatchEvent(new CustomEvent("forgotPassword"));
			render({
				selector: "[template*='forgotPassword']",
				data: [
					{
						type: "forgotPassword",
						message: response.message,
						success: response.success
					}
				]
			});
		});
	},

	resetPassword: async function (action) {
		let data = {
			method: "resetPassword"
		};
		let email = action.form.querySelector('input[key="email"]');
		if (email) data.email = await email.getValue();
		else return;

		let password = action.form.querySelector('input[key="password"]');
		if (password) data.password = await password.getValue();
		else return;

		let token = action.form.querySelector('input[key="token"]');
		if (token) data.token = await token.getValue();
		else return;

		Crud.socket.send(data).then((data) => {
			if (data.success)
				action.element.dispatchEvent(new CustomEvent("resetPassword"));
			else
				render({
					selector: "[template*='resetPassword']",
					data: [
						{
							type: "resetPassword",
							message: data.message,
							success: data.success
						}
					]
				});
		});
	}
};

Actions.init([
	{
		name: "signUp",
		endEvent: "signUp",
		callback: (action) => {
			CoCreateUser.signUp(action);
		}
	},
	{
		name: "signIn",
		endEvent: "signIn",
		callback: (action) => {
			CoCreateUser.signIn(action);
		}
	},
	{
		name: "signOut",
		endEvent: "signOut",
		callback: (action) => {
			CoCreateUser.signOut(action);
		}
	},
	{
		name: "inviteUser",
		endEvent: "inviteUser",
		callback: (action) => {
			CoCreateUser.inviteUser(action);
		}
	},
	{
		name: "acceptInvite",
		endEvent: "acceptInvite",
		callback: (action) => {
			CoCreateUser.acceptInvite(action);
		}
	},
	{
		name: "forgotPassword",
		endEvent: "forgotPassword",
		callback: (action) => {
			CoCreateUser.forgotPassword(action);
		}
	},
	{
		name: "resetPassword",
		endEvent: "resetPassword",
		callback: (action) => {
			CoCreateUser.resetPassword(action);
		}
	}
]);

let checkSessionTimeout;
function checkSession() {
	clearTimeout(checkSessionTimeout);
	checkSessionTimeout = setTimeout(function () {
		Crud.socket.send({
			method: "checkSession",
			broadcast: false,
			broadcastBrowser: false
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
