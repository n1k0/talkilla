/* global gapi */
/* jshint unused:false, camelcase:false */
/**
 * Google Contacts API helper.
 */
var GoogleContacts = (function() {
  var config = {
    "client_id": "583962873515.apps.googleusercontent.com",
    "scope":     "https://www.google.com/m8/feeds"
  };
  var baseUrl = [
    "https://www.google.com/m8/feeds/contacts/default/full",
    "?v=3.0",
    "&max-results=9999",
    "&alt=json",
    "&access_token="
  ].join('');

  function GoogleContacts() {
  }

  function _normalize(feedData) {
    // XXX: parse feed
    return feedData.feed.entry;
  }

  GoogleContacts.prototype = {
    /**
     * OAuth autorization for accessing user's contacts through the Google
     * Contacts API. Will open an OAuth popup window requiring the user to allow
     * the application to access his contacts data.
     *
     * *Warning:* requires `gapi` Google Javascript Client API. This depends on
     * the DOM therefore can't be used within a WebWorker.
     *
     * @param  {Function} cb Callback
     */
    authorize: function(cb) {
      var self = this;
      if (!gapi)
        return cb.call(this, new Error("gapi is missing"));
      gapi.auth.init(function() {
        gapi.auth.authorize(config, function() {
          // XXX: handle error
          var token = gapi.auth.getToken().access_token;
          self._storeToken(token);
          cb.call(self, null, token);
        });
      });
    },

    /**
     * Retrieves all Google Contacts from currently authenticated user.
     *
     * @param  {Function} cb Callback
     */
    all: function(cb) {
      var self = this, request = new XMLHttpRequest();
      request.onload = function() {
        try {
          cb.call(self, null, _normalize(JSON.parse(this.responseText)));
        } catch (err) {
          cb.call(self, err);
        }
      };
      request.onerror = function() {
        // XXX: todo
      };
      request.open("GET", baseUrl + encodeURIComponent(this.token), true);
      request.send();
    },

    /**
     * Stores a Google Authentication token locally.
     *
     * @param  {String}   token Authntication token
     * @param  {Function} cb    Callback
     */
    _storeToken: function(token, cb) {
      // XXX: store google api token in indexedDb or /somewhere/
      cb.call(this, null);
    }
  };

  return GoogleContacts;
})();
