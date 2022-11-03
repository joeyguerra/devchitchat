var test = require("tap").test;
var authenticator = require('../../lib/authenticator/index.mjs')("some super secret secret");
var uuid = require('uuid');
var signer = require('jws');

test("Signed token is authorized", function (t) {
  var token = uuid.v4();
  var authenticated = authenticator.execute(authenticator.sign(token));
  t.ok(authenticated, "A signed token is authorized");
  t.end();
});

test("Unsigned token is not authorized", function (t) {
  var token = uuid.v4();
  var authenticated = authenticator.execute(token);
  t.ok(!authenticated, "An unsigned token is not authorized");
  t.end();
});

test("NULL token is not authorized", function(t){
  var token = null;
  var authenticated = authenticator.execute(token);
  t.ok(!authenticated, "Null token is not authenticated");
  t.end();
});

test("Empty token is not authorized", function(t){
  var token = '';
  var authenticated = authenticator.execute(token);
  t.ok(!authenticated, "Empty token is not authenticated");
  t.end();
});

test("Token signed with a different secret", function(t){
  var token = signer.sign({
    header: {alg: 'HS256'},
    payload: uuid.v4(),
    secret: "some other secret"
  });
  t.ok(!authenticator.execute(token), "Token signed with a different secret is not authenticated");
  t.end();
});
