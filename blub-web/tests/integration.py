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

def avatar_upload(image):
    boundary = 'AvatarTest'
    fields = {'action':'profile', 'name':'Test Avatar', 'handle':users[0]}
    parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode()
             for key,value in fields.items()]
    parts.extend([f'--{boundary}\r\nContent-Disposition: form-data; name="avatar"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n'.encode(),
                  image, f'\r\n--{boundary}--\r\n'.encode()])
    return request(users[0], b''.join(parts), content_type='multipart/form-data; boundary='+boundary)

avatar_bytes = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2uioAAAAASUVORK5CYII=')
assert avatar_upload(b'not an image')[0] == 400
assert avatar_upload(avatar_bytes)[0] == 200
version = feed(users[0])['me']['avatar']
avatar_path = '/api/blub?action=avatar&id='+users[0]+'&v='+version
assert request(users[2], path=avatar_path) == (200, avatar_bytes)
assert avatar_upload(avatar_bytes)[0] == 200
assert request(users[2], path=avatar_path)[0] == 404
upload('First moment')
time.sleep(.01)
upload('Second moment')
posts = feed(users[0])['posts']
assert [p['caption'] for p in posts] == ['Second moment', 'First moment']
assert [p['id'] for p in request(users[0], path='/api/blub?action=mine')[1]['posts']] == [p['id'] for p in posts]
assert not request(users[1], path='/api/blub?action=mine')[1]['posts']
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
post_id = posts[0]['id']
thread = '/api/blub?action=comments&id=' + post_id
def comment(user, body, key):
    return act(user, action='comment', id=post_id, body=body, requestId=key)

assert act(users[2], action='like', id=post_id)[0] == 404
assert comment(users[2], 'private', 'outside')[0] == 404
assert request(users[2], path=thread)[0] == 404
for _ in range(2):
    assert act(users[1], action='like', id=post_id)[0] == 200
    assert comment(users[1], ' Nice photo! ', 'first')[0] == 200
liked = feed(users[1])['posts'][0]
assert (liked['liked'], liked['like_count'], liked['comment_count']) == (1, 1, 1)
assert feed(users[0])['posts'][0]['liked'] == 0
assert comment(users[1], '  ', 'empty')[0] == 400
assert comment(users[1], 'x' * 1001, 'long')[0] == 400
for index in range(30):
    assert comment(users[0], 'Reply ' + str(index), 'reply-' + str(index))[0] == 200
page = request(users[1], path=thread)[1]
assert page['more'] and len(page['comments']) == 30
assert page['comments'][-1]['body'] == 'Reply 29'
earlier = request(users[0], path=thread + '&before=' + str(page['comments'][0]['id']))[1]
assert not earlier['more'] and earlier['comments'][0]['body'] == 'Nice photo!'
assert earlier['comments'][0]['handle'] == users[1]
assert act(users[1], action='unlike', id=post_id)[0] == 200
assert feed(users[0])['posts'][0]['like_count'] == 0
assert act(users[0], action='like', id=post_id)[0] == 200
assert act(users[1], action='remove', id=friendship)[0] == 200
assert request(users[1], path=thread)[0] == 404
assert comment(users[1], 'revoked', 'revoked')[0] == 404
assert not feed(users[1])['posts']
assert request(users[1], path=photo)[0] == 404
for p in posts:
    assert act(users[0], action='delete', id=p['id'])[0] == 200
assert not feed(users[0])['posts']
assert request(users[0], path=photo)[0] == 404
assert request(users[0], path=thread)[0] == 404
print('PASS: likes, comments, pagination, interaction privacy, accounts, validation, reciprocal requests, recipient-only acceptance, chronological posts, private photos, revocation, owner-only deletion.')
print('Only disposable profiles remain in the LOCAL test database.')
