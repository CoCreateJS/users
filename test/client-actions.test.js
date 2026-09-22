import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('const CoCreateUser ='), source.indexOf('let checkSessionTimeout;'));

function setup(response, rejected = false, offline = false) {
    let actions;
    const notifications = [];
    const config = new Map();
    const send = async () => {
        if (rejected) throw new Error('Connection failed');
        return response;
    };
    vm.runInNewContext(code, {
        document: {},
        Crud: { send, socket: { send, getSockets: async () => [{ connected: !offline }] } },
        Actions: { init: value => { actions = value; } },
        Elements: { getData: async () => [{ array: 'contacts', object: { email: 'test@example.com', password: 'secret' } }] },
        Config: { set: (key, value) => config.set(key, value), delete: key => config.delete(key) },
        render: value => notifications.push(value),
        window: { navigator: { onLine: !offline }, location: {}, btoa: value => value }
    });
    return { actions, notifications, config };
}

const fields = ['email', 'password', 'token', '_id'].map(key => ({
    type: key === 'password' ? 'password' : 'text',
    getAttribute: () => key,
    getValue: async () => key === 'email' ? 'test@example.com' : 'value'
}));
const form = { querySelector: () => fields[0], querySelectorAll: () => fields.slice(0, 2) };

for (const name of ['signUp', 'signIn', 'signOut', 'inviteUser', 'acceptInvite', 'forgotPassword', 'resetPassword']) {
    for (const success of name === 'signOut' ? [true] : [true, false]) {
        test(`${name} ${success ? 'ends' : 'aborts'} and renders a notification`, async () => {
            const response = { success, message: 'Server message', user_id: 'user-1', token: 'session' };
            const { actions, notifications, config } = setup(response);
            let ended = 0, aborted = 0;
            await actions.find(action => action.name === name).callback({
                name, form,
                end: detail => {
                    ended++;
                    assert.equal(detail.success, true);
                    if (name === 'signIn') assert.equal(config.get('user_id'), 'user-1');
                    assert.equal(notifications.length, 1);
                },
                abort: () => aborted++
            });
            assert.equal(ended, Number(success));
            assert.equal(aborted, Number(!success));
            assert.equal(notifications[0].selector, '[template~="notification"]');
            assert.equal(notifications[0].data.status, success ? 'success' : 'error');
            if (name !== 'signOut') assert.equal(notifications[0].data.message, 'Server message');
        });
    }
    if (name === 'signOut') continue;
    test(`${name} aborts a rejected request`, async () => {
        const { actions, notifications } = setup({}, true);
        let aborted = 0;
        await actions.find(action => action.name === name).callback({
            name, form, end: () => assert.fail('Must not advance'), abort: () => aborted++
        });
        assert.equal(aborted, 1);
        assert.equal(notifications[0].data.message, 'Connection failed');
    });
}

test('offline signup ends when the credential record is created', async () => {
    const { actions } = setup({ object: [{ _id: 'key-1' }] }, false, true);
    let ended = false;
    await actions.find(action => action.name === 'signUp').callback({
        name: 'signUp', form, end: () => { ended = true; }, abort: () => assert.fail('Must succeed')
    });
    assert.equal(ended, true);
});
