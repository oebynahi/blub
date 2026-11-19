"""Exercise the built local Worker with disposable identities; never production.
Run after applying local migrations and starting `npm start -- --port 8787`.
"""
import base64
import json
import time
import urllib.request
import urllib.error
import uuid

BASE = 'http://127.0.0.1:8787'
run = uuid.uuid4().hex[:10]
users = ['test_' + run + '_' + letter for letter in 'abc']

def request(user=None, body=None, path='/api/blub', method=None, content_type='application/json'):
    headers = {'Origin': BASE}
    if user:
        headers.update({'oai-authenticated-user-id': user, 'oai-authenticated-user-email': user + '@example.test'})
    if body is not None:
        headers['Content-Type'] = content_type
        if isinstance(body, dict): body = json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            data = r.read()
            return r.status, json.loads(data) if 'application/json' in r.headers.get('Content-Type', '') else data
    except urllib.error.HTTPError as e:
        raw = e.read()
        try: return e.code, json.loads(raw)
        except ValueError: return e.code, raw.decode()

def act(identity, **body): return request(identity, body)
def feed(user):
    status, data = request(user)
    assert status == 200, data
    return data

assert request()[1]['authenticated'] is False
assert request(body={'action':'profile'})[0] == 401
for i, user in enumerate(users):
    result = act(user, action='profile', name='Test ' + str(i), handle=user)
    assert result[0] == 200, result
assert act(users[2], action='profile', name='Duplicate', handle=users[0])[0] == 409
assert act(users[0], action='request', user=users[0])[0] == 400
assert act(users[1], action='profile', name='Bad', handle='bad handle')[0] == 400

def upload(caption):
    boundary = 'BlubTestBoundary'
    png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2uioAAAAASUVORK5CYII=')
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n{caption}\r\n--{boundary}\r\nContent-Disposition: form-data; name="photo"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n'.encode() + png + f'\r\n--{boundary}--\r\n'.encode())
    assert request(users[0], body, content_type='multipart/form-data; boundary=' + boundary)[0] == 200

upload('First moment')
time.sleep(.01)
upload('Second moment')
posts = feed(users[0])['posts']
assert [p['caption'] for p in posts] == ['Second moment', 'First moment']
photo = '/api/blub?action=photo&id=' + posts[0]['id']
assert request(users[0], path=photo)[0] == 200
assert not feed(users[1])['posts']
assert request(users[1], path=photo)[0] == 404
assert act(users[0], action='request', user=users[1])[0] == 200
assert act(users[1], action='request', user=users[0])[0] == 200
assert len(feed(users[0])['friends']) == 1
friendship = feed(users[1])['friends'][0]['id']
act(users[0], action='accept', id=friendship)
assert not feed(users[1])['posts'], 'Sender must not accept their own request'
assert request(users[1], path=photo)[0] == 404
assert act(users[1], action='accept', id=friendship)[0] == 200
assert len(feed(users[1])['posts']) == 2
assert request(users[1], path=photo)[0] == 200
assert not feed(users[2])['posts']
assert request(users[2], path=photo)[0] == 404
assert act(users[1], action='delete', id=posts[0]['id'])[0] == 404
assert act(users[1], action='remove', id=friendship)[0] == 200
assert not feed(users[1])['posts']
assert request(users[1], path=photo)[0] == 404
for p in posts:
    assert act(users[0], action='delete', id=p['id'])[0] == 200
assert not feed(users[0])['posts']
assert request(users[0], path=photo)[0] == 404
print('PASS: accounts, validation, reciprocal requests, recipient-only acceptance, chronological posts, private photos, revocation, owner-only deletion.')
print('Only disposable profiles remain in the LOCAL test database.')
