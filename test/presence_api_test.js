/* global describe, it, beforeEach, afterEach */
/* jshint expr:true */

var expect = require("chai").expect;
var request = require("request");
var app = require("../presence").app;
var findNewNick = require("../presence").findNewNick;

/* The "browser" variable predefines for jshint include WebSocket,
 * causes jshint to blow up here.  We should probably structure things
 * differently so that the browser predefines aren't turned on
 * for the node code at some point.  In the meantime, disable warning */
/* jshint -W079 */
var WebSocket = require('ws');

var webSocket;

var serverPort = 3000;
var serverHost = "localhost";
var serverHttpBase = 'http://' + serverHost + ':' + serverPort;
var socketURL = 'ws://' + serverHost + ':' + serverPort;

describe("Server", function() {
  describe("startup & shutdown", function() {

    it("should answer requests on a given port after start() completes",
      function(done) {
        var retVal = app.start(serverPort, function() {
          webSocket = new WebSocket(socketURL);

          webSocket.on('error', function(error) {
            expect(error).to.equal(null);
          });

          webSocket.on('open', function() {
            app.shutdown(done);
          });
        });

        expect(retVal).to.equal(undefined);

        // XXX test HTTP connection requests also
      });

    it("should refuse requests after shutdown() completes");

    it("should (eventually?) close connections after shutdown() completes");
  });

  describe("presence", function() {

    function signin(nick, callback) {
      request.post(serverHttpBase + '/signin',
                   {form: {nick: nick}},
                   callback);
    }

    function signout(nick, callback) {
      request.post(serverHttpBase + '/signout',
                   {form: {nick: nick}},
                   callback);
    }

    beforeEach(function(done) {
      app.start(serverPort, done);
    });

    afterEach(function() {
      // XXX after we get deterministic tests for all of the intermittent
      // fails, add a done param to this function, pass it to app.shutdown
      // below, move the app.shutdown after the webSocket.close.  And decide
      // if we want to wait for the websocket.close() to finish also
      // (I suspect not)
      app.shutdown();
      if (webSocket) {
        webSocket.close();
        webSocket = null;
      }
    });

    it("should have no users logged in at startup", function() {
      expect(app.get("users")).to.be.empty;
    });

    it('should have no users logged in after logging in and out',
      function(done) {
      signin('foo', function() {
        signout('foo', function() {
          expect(app.get('users')).to.be.empty;
          done();
        });
      });
    });

    it("should return the user's nick", function(done) {
      var nick1 = 'foo';
      signin('foo', function(err, res, body) {
        var data = JSON.parse(body);
        expect(data.nick).to.eql(nick1);
        expect(data.users).to.be.empty;
        done();
      });
    });

    it("should fix the user's nick if it already exists", function(done) {
      var nick1 = 'foo';
      /* jshint unused: vars */
      signin(nick1, function(err, res, body) {
        signin(nick1, function(err, res, body) {
          expect(JSON.parse(body).nick).to.eql(findNewNick(nick1));
          done();
        });
      });
    });

    it("should preserve existing chars of the nick when finding a new one",
       function() {
      var testNicks = {
        "foo": "foo1",
        "foo1": "foo2",
        "foo10": "foo11",
        "foo0": "foo1",
        "foo01": "foo02",
        "foo09": "foo10",

        // Now put a number in the "first part".
        "fo1o": "fo1o1",
        "fo1o1": "fo1o2",
        "fo1o10": "fo1o11",
        "fo1o0": "fo1o1",
        "fo1o01": "fo1o02",
        "fo1o09": "fo1o10"
      };
      for (var nick in testNicks)
        expect(findNewNick(nick)).to.equal(testNicks[nick]);
    });

    it("should return existing users", function(done) {
      var nick1 = "foo";
      var nick2 = "bar";

      signin(nick1, function() {
          signin(nick2, function(err, res, body) {
            var data = JSON.parse(body);
            expect(data.nick).to.eql(nick2);
            done();
          });
        });
    });

    it("should respond to an websocket open with an empty list of logged in " +
       "users when no users are logged in",
      function(done) {

        webSocket = new WebSocket(socketURL);

        webSocket.on('error', function(error) {
          expect(error).to.equal(null);
        });

        webSocket.on('message', function (data, flags) {
          expect(flags.binary).to.equal(undefined);
          expect(flags.masked).to.equal(false);
          expect(JSON.parse(data).users).to.deep.equal([]);
          done();
        });

      });

    it("should respond to a websocket open that follows a sign-in with a " +
       "list of just the signed-in user",
      function (done) {

        signin('foo', function () {
          webSocket = new WebSocket(socketURL);

          webSocket.on('error', function(error) {
            expect(error).to.equal(null);
          });

          // jshint unused:vars
          webSocket.on('message', function (data, flags) {
            expect(JSON.parse(data).users).to.deep.equal([{nick: "foo"}]);
            done();
          });
        });
      });

    it("should send the user list to all websockets when a user signs in");

    it("should send the user list to all websockets when a user signs out");

  });
});
