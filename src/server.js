/********************************************************************************
 * Copyright (C) 2023 CoCreate and Contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 ********************************************************************************/

// Commercial Licensing Information:
// For commercial use of this software without the copyleft provisions of the AGPLv3,
// you must obtain a commercial license from CoCreate LLC.
// For details, visit <https://CoCreateJS.com/licenses/> or contact us at sales@CoCreateJS.com.

let server;

function connectionFields(data) {
    return {
        host: data.host,
        organization_id: data.organization_id,
        clientId: data.clientId,
        socketId: data.socketId
    };
}

// Credential operations are private CRUD work. Only the final application response
// carries the requesting client's delivery and correlation fields.
function privateRequest(data) {
    const envelope = { ...data };
    for (const field of [
        "socketId", "clientId", "uuid", "frameId", "replyOrganizationId",
        "broadcast", "broadcastClient", "broadcastSender", "subscription", "subscriptionKeys",
        "server", "worker", "cluster", "master", "serverId", "workerId", "clusterId", "response"
    ]) delete envelope[field];
    return envelope;
}

/**
 * Handles the user sign-up process by performing identity validation,
 * contact record synchronization, and credential attachment.
 * @private
 * @environment server
 */
async function signUp(data) {
    try {
        let response = {
            ...connectionFields(data),
            method: "signUp",
            success: false,
            message: "signUp failed",
            organization_id: data.organization_id,
            uuid: data.uuid
        };

        const userObject = Array.isArray(data.user?.object)
            ? data.user.object[0]
            : data.user?.object;
        const targetEmail = userObject?.email ?? data.userKey?.object?.email;
        const targetId = userObject?._id;

        // --- STEP 1: The Ultimate Gatekeeper Check ---
        // We look in the 'keys' array to see if this email OR this ID is already registered.
        if (!server || !server.crud) return;

        const keyCheck = await server.crud.send({
            method: "object.read",
            organization_id: data.organization_id,
            host: data.host,
            user_id: data.user_id,
            array: "keys",
            filter: {
                limit: 1,
                query: {
                    $or: [
                        { "email": targetEmail },
                        { "key": targetId }
                    ]
                }
            }
        });

        // Detailed error messaging for the user
        if (keyCheck?.object?.length > 0) {
            const match = keyCheck.object[0];

            if (match.email === targetEmail && match.key !== targetId) {
                response.message = "Email is already in use with another account";
            } else if (match.key === targetId) {
                response.message = "You already have an account, try signing in instead";
            } else {
                response.message = "An account with these details already exists";
            }

            server.send(response);
            return; // Exit early: Gatekeeper blocked the sign-up.
        }

        // --- STEP 2: Resolve or Create the Contact ---
        if (data.user) {
            if (userObject) {
                delete userObject.password; // Remove password attribute to avoid plain text database leakage
            }

            const userRequest = privateRequest({
                ...data.user,
                method: "object.create",
                host: data.host,
                user_id: data.user_id,
                organization_id: data.organization_id
            });
            let userResult = await server.crud.send(userRequest);

            // --- STEP 3: Create the Key ---
            if (data.userKey && userResult.object?.[0]?._id) {
                const resolvedUserId = userResult.object[0]._id;

                const userKeyRequest = privateRequest({
                    ...data.userKey,
                    method: "object.create",
                    host: data.host,
                    user_id: data.user_id,
                    organization_id: data.organization_id,
                    object: {
                        ...data.userKey.object,
                        key: resolvedUserId,
                        email: targetEmail
                    }
                });

                // Get the result and check for an ID to confirm success
                let createdKey = await server.crud.send(userKeyRequest);

                if (createdKey.object?.[0]?._id) {
                    response.success = true;
                    response.message = "signUp successful";
                } else {
                    response.message = "Account creation failed at credential stage";
                }
            } else {
                response.message = "Account creation failed at user stage";
            }
        }

        server.send(response);

    } catch (error) {
        console.error("signup error", error);
    }
}

/**
 * Executes credential matching queries, assigns socket-level identifiers,
 * and encodes secure session web tokens.
 * @private
 * @environment server
 */
async function signIn(data) {
    try {
        if (!server || !server.crud) return;

        data.method = "object.read";
        data.array = "keys";
        const result = await server.crud.send(privateRequest(data));

        let response = {
            ...connectionFields(data),
            host: result.host || data.host,
            method: "signIn",
            success: false,
            message: "signIn failed",
            userStatus: "offline",
            organization_id: data.organization_id,
            uuid: data.uuid
        };

        if (
            result.object[0] &&
            result.object[0]._id &&
            server.authenticate
        ) {
            const user_id = result.object[0].key;
            const token = server.authenticate.encodeToken(
                data.organization_id,
                user_id,
                data.clientId,
                data.host
            );

            if (token && token !== "null") {
                const session = await server.authenticate.decodeToken(
                    token,
                    data.organization_id,
                    data.clientId,
                    data.host
                );
                const socket = server.socket?.get(data.socketId);
                if (!socket) throw new Error("Unable to find the active socket for sign-in");
                socket.user_id = user_id;
                socket.expires = session.expires;
                response.success = true;
                response.message = "signIn successful";
                response.userStatus = "online";
                response.user_id = user_id;
                response.token = token;
            }
        }

        server.send(response);
        server.send({
            ...connectionFields(data),
            host: result.host || data.host,
            method: "updateUserStatus",
            user_id: response.user_id,
            userStatus: response.userStatus,
            organization_id: data.organization_id
        });
    } catch (error) {
        console.error("signIn failed", error);
    }
}

/**
 * Updates dynamic user activity indicators ('online', 'offline', 'idle').
 * @private
 * @environment server
 */
async function userStatus(data) {
    try {
        if (!server || !server.crud) return;

        if (data.user_id && data.userStatus) {
            let targetArray = "users"; // default fallback
            let keyData = await server.crud.send({
                method: "object.read",
                host: data.host,
                array: "keys",
                filter: {
                    query: { key: data.user_id },
                    limit: 1
                },
                organization_id: data.organization_id
            });

            if (keyData && keyData.object && keyData.object.length > 0 && keyData.object[0].array) {
                targetArray = keyData.object[0].array;
            }

            data.array = targetArray;
            data["object"] = {
                _id: data.user_id,
                userStatus: data.userStatus
            };

            data.method = "object.update";
            const updatedData = await server.crud.send({ ...data });

            server.send({
                ...connectionFields(data),
                method: "updateUserStatus",
                host: data.host,
                user_id: data.user_id,
                clientId: data.clientId,
                userStatus: data.userStatus,
                token: data.token,
                organization_id: data.organization_id
            });
        } else {
            server.send({
                ...connectionFields(data),
                method: "updateUserStatus",
                host: data.host,
                user_id: data.user_id,
                userStatus: data.userStatus,
                clientId: data.clientId,
                token: data.token,
                organization_id: data.organization_id
            });
        }
    } catch (error) {
        console.error("userStatus error", error);
    }
}

/**
 * Quickly checks for valid runtime credentials assigned to active client connections.
 * @private
 * @environment server
 */
async function checkSession(data) {
    try {
        data.method = "updateUserStatus";

        if (!data.user_id) data.userStatus = "offline";
        else data.userStatus = "online";

        server.send({ ...data });
    } catch (error) {
        console.error("checkSession error", error);
    }
}

/**
 * Creates, formats, and dispatches email invitations to new team collaborators.
 * @private
 * @environment server
 */
async function inviteUser(data) {
    try {
        if (!server || !server.crud) return;

        const inviteId = server.crud.ObjectId().toString();
        let uuid = data.uuid;
        delete data.uuid;

        let targetArray = "users"; // default fallback
        let keyData = await server.crud.send({
            method: "object.read",
            host: data.host,
            array: "keys",
            filter: {
                query: { key: data.user_id },
                limit: 1
            },
            organization_id: data.organization_id
        });

        if (keyData && keyData.object && keyData.object.length > 0 && keyData.object[0].array) {
            targetArray = keyData.object[0].array;
        }

        data.method = "object.update";
        data.array = targetArray;
        data.object = {
            _id: data.user_id,
            "$push.invitations": inviteId,
            "$addToSet.members": data.email
        };

        // Bypass crud.sync check to update across local clients simultaneously
        data.updateDB = true;

        const updatedData = await server.crud.send({ ...data });

        let invitee = await server.crud.send({
            method: "object.read",
            host: updatedData.host,
            array: "users",
            filter: {
                query: { email: updatedData.email },
                limit: 1
            },
            organization_id: updatedData.organization_id
        });

        if (invitee.object && invitee.object[0]) {
            invitee = invitee.object[0]._id;
        } else {
            invitee = "";
        }

        let htmlBody = `
<html>
<head>
  <title>Welcome to Yellow Oracle!</title>
</head>
<body>
  <p>Hello,</p>

  <p>You have been invited to join ${updatedData.name} on Yellow Oracle.</p>

  <p><a href="${updatedData.origin}${updatedData.path}?email=${updatedData.email}&token=${inviteId}&user_id=${invitee}&name=${updatedData.name}" style="color: #ffffff; background-color: #FFD700; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Accept Your Invitation</a></p>

  <p>Please note, this invitation link will expire in 48 hours. We encourage you to accept it soon to begin your journey with ${updatedData.name} on Yellow Oracle.</p>

  <p>If the button above doesn't work, you can copy and paste the following URL into your web browser:</p>
  <p><a href="${updatedData.origin}${updatedData.path}?email=${updatedData.email}&token=${inviteId}&user_id=${invitee}&name=${updatedData.name}">${updatedData.origin}${updatedData.path}?email=${updatedData.email}&token=${inviteId}&user_id=${invitee}&name=${updatedData.name}</a></p>

  <p>If you received this invitation by mistake or have any questions, please don't hesitate to get in touch with our support team at <a href="mailto:support@${updatedData.hostname}">support@${updatedData.hostname}</a>.</p>

  <p>We look forward to welcoming you to ${updatedData.name}'s Yellow Oracle account!</p>

</body>
</html>                                                                                                            
`;

        let email = {
            method: "postmark.sendEmail",
            host: updatedData.host,
            postmark: {
                From: updatedData.from,
                To: updatedData.email,
                Subject: `${updatedData.name} has invited you to join them on Yellow Oracle`,
                HtmlBody: htmlBody,
                TextBody:
                    "Hello, \n\nWe received a request to join Yellow Oracle. Please copy and paste the invitation link directly to proceed.",
                MessageStream: "outbound"
            },
            organization_id: updatedData.organization_id
        };

        if (server.wsManager) {
            server.wsManager.emit("postmark", email);
        }

        let response = {
            ...connectionFields(data),
            host: updatedData.host || data.host,
            method: "inviteUser",
            success: true,
            message: "Successfully sent invite",
            organization_id: data.organization_id,
            uuid
        };

        server.send(response);
    } catch (error) {
        data.error = error;
        server.send({ ...data });
        console.error("Invite User failed", error);
    }
}

/**
 * Validates outstanding team tokens and connects user accounts to parent environments.
 * @private
 * @environment server
 */
async function acceptInvite(data) {
    try {
        if (!server || !server.crud) return;
        if (!data.token || !data.user_id) {
            return;
        }

        let uuid = data.uuid;
        delete data.uuid;

        data.method = "object.update";
        data.array = "users";
        data.object = {
            "$pull.invitations": data.token,
            "$pull.members": data.email
        };
        data.filter = {
            query: {
                invitations: { $in: [data.token] },
                members: { $in: [data.email] }
            },
            limit: 2
        };

        data.updateDB = true;

        const updatedData = await server.crud.send({ ...data });

        let response = {
            ...connectionFields(data),
            host: updatedData.host || data.host,
            method: "acceptInvite",
            success: false,
            message:
                "The token is invalid or has expired. However, you can still access your account. Please request a new invite to proceed, and feel free to explore the available features while you wait.",
            organization_id: data.organization_id,
            uuid
        };

        for (let object of updatedData.object) {
            if (object._id) {
                delete updatedData.filter;
                updatedData.object = {
                    _id: object._id,
                    "$addToSet.members": updatedData.user_id
                };
                const finalData = await server.crud.send({ ...updatedData });
                await server.crud.send({
                    method: "object.update",
                    host: finalData.host,
                    array: "users",
                    object: {
                        _id: finalData.user_id,
                        memberAccount: object._id,
                        subscription: "6571fe530c48ef6970900a82"
                    }
                });
                response.success = true;
                response.message = "Invite Accepted";
                break;
            }
        }

        server.send(response);
    } catch (error) {
        console.error("Accept invite failed", error);
    }
}

/**
 * Constructs recovery parameters and sends secure password-reset tokens to verified accounts.
 * @private
 * @environment server
 */
async function forgotPassword(data) {
    try {
        if (!server || !server.crud) return;

        const recoveryId = server.crud.ObjectId().toString();
        data.method = "object.update";
        data.array = "keys";
        data.object = { recoveryId };
        data.filter = {
            query: { email: data.email },
            limit: 1
        };

        const result = await server.crud.send(privateRequest(data));

        let response = {
            ...connectionFields(data),
            host: result.host || data.host,
            method: "forgotPassword",
            success: false,
            message: "Email does not exist",
            organization_id: result.organization_id,
            uuid: data.uuid
        };

        for (let object of result.object) {
            if (object._id) {
                response.success = true;
                response.message = "Email Sent";
                let htmlBody = `
<html>
<head>
  <title>Reset Your Password</title>
</head>
<body>
  <p>Hello,</p>

  <p>We received a request to reset the password for your account. If you did not make this request, please ignore this email. Otherwise, you can reset your password using the link below.</p>

  <p><a href="${result.origin}${result.path}?email=${result.email}&token=${recoveryId}&recoveyId=${recoveryId}" style="color: #ffffff; background-color: #007bff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset My Password</a></p>

  <p>This link will expire in 24 hours for your security.</p>

  <p>If you're having trouble with the button above, copy and paste the URL below into your web browser:</p>
  <p><a href="${result.origin}${result.path}?email=${result.email}&token=${recoveryId}&recoveyId=${recoveryId}">${result.origin}${result.path}?email=${result.email}&token=${recoveryId}&recoveyId=${recoveryId}</a></p>

  <p>Need more help? Our support team is here for you. Contact us at <a href="mailto:support@${result.hostname}">support@${result.hostname}</a>.</p>

  <p>Thank you for using our services!</p>

</body>
</html>
`;
                let email = {
                    method: "postmark.sendEmail",
                    host: result.host,
                    postmark: {
                        From: result.from,
                        To: result.email,
                        Subject: "Reset Your Password Easily",
                        HtmlBody: htmlBody,
                        TextBody:
                            "Hello, \n\nWe received a request to reset the password for your account. If you did not make this request, please ignore this email. Otherwise, you can reset your password by accessing your personal recovery link directly.",
                        MessageStream: "outbound"
                    },
                    organization_id: result.organization_id
                };

                if (server.wsManager) {
                    server.wsManager.emit("postmark", email);
                }
                break;
            }
        }

        server.send(response);
    } catch (error) {
        console.error("Forgot Password failed", error);
    }
}

/**
 * Validates individual recovery tokens and writes new user credentials safely.
 * @private
 * @environment server
 */
async function resetPassword(data) {
    try {
        if (!server || !server.crud) return;
        if (!data.email || !data.password || !data.token) return;

        data.method = "object.update";
        data.array = "keys";
        data.object = { password: data.password, recoveryId: "" };
        data.filter = {
            query: { email: data.email, recoveryId: data.token },
            limit: 1
        };

        const result = await server.crud.send(privateRequest(data));

        let response = {
            ...connectionFields(data),
            host: result.host || data.host,
            method: "resetPassword",
            success: false,
            message: "Token is invalid or has expired",
            organization_id: result.organization_id,
            uuid: data.uuid
        };

        for (let object of result.object) {
            if (object._id) {
                response.success = true;
                response.message = "Password reset successful";
                break;
            }
        }

        server.send(response);
    } catch (error) {
        console.error("Password reset failed", error);
    }
}

/**
 * Registers user socket handlers on a CoCreate server context.
 * @param {Object} serverInstance - Server providing CRUD and socket services.
 * @returns {Object} The configured server context.
 * @public
 * @environment server
 */
export function init(serverInstance) {
    if (!serverInstance?.crud || !serverInstance?.wsManager) {
        throw new Error("[@cocreate/users] init requires a server with crud and wsManager.");
    }

    server = serverInstance;
    server.wsManager.on("signUp", (data) => signUp(data));
    server.wsManager.on("signIn", (data) => signIn(data));
    server.wsManager.on("userStatus", (data) => userStatus(data));
    server.wsManager.on("checkSession", (data) => checkSession(data));
    server.wsManager.on("inviteUser", (data) => inviteUser(data));
    server.wsManager.on("acceptInvite", (data) => acceptInvite(data));
    server.wsManager.on("forgotPassword", (data) => forgotPassword(data));
    server.wsManager.on("resetPassword", (data) => resetPassword(data));
    return server;
}

/**
 * A simple users component in vanilla javascript. Easily configured using HTML5 attributes and/or JavaScript API.
 *
 * @module users
 * @environment server
 */
