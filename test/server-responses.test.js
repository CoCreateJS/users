import assert from 'node:assert/strict';
import test from 'node:test';
import { init } from '../src/server.js';

function fixture() {
    const handlers = new Map();
    const requests = [];
    const sent = [];
    const emails = [];
    const socket = { id: 'socket' };
    const server = {
        send(data) { sent.push(data); return Promise.resolve(data); },
        wsManager: {
            on(name, handler) { handlers.set(name, handler); },
            emit(name, data) { emails.push({ name, data }); }
        },
        socket: { get(id) { return id === 'socket' ? socket : undefined; } },
        authenticate: { encodeToken: () => 'session-token', decodeToken: async () => ({ expires: Date.now() + 60000 }) },
        crud: {
            ObjectId: () => 'recovery-secret',
            async send(request) {
                requests.push(request);
                const object = request.method === 'object.read' && !request.filter?.query?.email && request.filter?.query?.$or
                    ? [] : [{ _id: 'record', key: 'user', password: 'credential-secret', recoveryId: 'recovery-secret' }];
                const response = { ...request, object };
                // CRUD dispatches its result as well as returning it. Private work must lack destinations.
                server.send(response);
                return response;
            }
        }
    };
    init(server);
    return { handlers, requests, sent, socket, emails };
}

function request(method) {
    return {
        method, organization_id: 'org', host: 'host.test', user_id: 'sender',
        socketId: 'socket', clientId: 'client', uuid: 'original-request', frameId: 'frame',
        broadcast: true, subscriptionKeys: ['keys'], response: true,
        replyOrganizationId: 'org', socket: {},
        email: 'user@example.test', password: 'new-password', token: 'recovery-secret',
        from: 'support@example.test', origin: 'https://host.test', path: '/auth/', hostname: 'host.test',
        filter: { query: { email: 'user@example.test', password: 'password' } }
    };
}

for (const method of ['signIn', 'forgotPassword', 'resetPassword']) {
    test(`${method} keeps credential CRUD private and correlates only its final response`, async () => {
        const f = fixture();
        await f.handlers.get(method)(request(method));
        assert.equal(f.requests.length, 1);
        const query = f.requests[0];
        assert.equal(query.organization_id, 'org');
        assert.equal(query.host, 'host.test');
        assert.equal(query.user_id, 'sender');
        for (const field of ['socket', 'socketId', 'clientId', 'uuid', 'broadcast', 'subscriptionKeys', 'response', 'replyOrganizationId']) {
            assert.equal(field in query, false, `${field} must not route a credential result`);
        }
        const correlated = f.sent.filter(data => data.uuid === 'original-request');
        assert.equal(correlated.length, 1);
        assert.equal(correlated[0].method, method);
        assert.equal(correlated[0].success, true);
        assert.equal(correlated[0].socketId, 'socket');
        assert.equal(correlated[0].clientId, 'client');
        assert.equal(correlated[0].object, undefined);
        if (method === 'signIn') assert.equal(f.socket.user_id, 'user');
        if (method === 'forgotPassword') assert.equal(f.emails[0].name, 'postmark');
    });
}

test('signup credentials and profile writes retain trusted scope without nested routing overrides', async () => {
    const f = fixture();
    const data = request('signUp');
    data.user = { array: 'users', clientId: 'forged-client', uuid: data.uuid, broadcast: true, user_id: 'forged-user', object: { email: data.email, password: data.password } };
    data.userKey = { array: 'keys', socketId: 'forged-socket', uuid: data.uuid, broadcast: true, user_id: 'forged-user', object: { password: data.password } };
    await f.handlers.get('signUp')(data);
    assert.equal(f.requests.length, 3);
    for (const query of f.requests) {
        assert.equal(query.organization_id, 'org');
        assert.equal(query.host, 'host.test');
        assert.equal(query.user_id, 'sender');
        for (const field of ['clientId', 'socketId', 'uuid', 'broadcast']) assert.equal(field in query, false);
    }
    assert.equal(f.requests[1].object.password, undefined);
    assert.equal(f.requests[2].object.key, 'record');
    const replies = f.sent.filter(data => data.uuid === 'original-request');
    assert.equal(replies.length, 1);
    assert.equal(replies[0].success, true);
});
