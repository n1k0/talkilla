/* global gapi */
/* jshint unused:false, camelcase:false */
/**
 * Google Contacts API helper.
 */
var GoogleContacts = (function() {
  var AUTH_COOKIE_NAME = "google.auth.token";
  var config = {
    // XXX: more official mozilla-owned google app id?
    "client_id": "583962873515.apps.googleusercontent.com",
    "scope":     "https://www.google.com/m8/feeds"
  };
  var baseUrl = [
    "https://www.google.com/m8/feeds/contacts/default/full",
    "?v=3.0",
    // "&max-results=9999", // uncomment to retrieve all contacts
    "&alt=json",
    "&access_token="
  ].join('');

  function GoogleContacts(options) {
    options = options || {};
    this.token = options && options.token || this._getToken();
  }

  function _normalize(feedData) {
    return feedData.feed.entry.reduce(function(emails, entry) {
      if (!entry.gd$email)
        return emails;
      return emails.concat(entry.gd$email.map(function(email) {
        return email.address;
      }));
    }, []);
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
      if (typeof gapi !== "object")
        return cb.call(this, new Error("gapi is missing"));
      gapi.auth.init(function() {
        gapi.auth.authorize(config, function(auth) {
          try {
            this._storeToken(auth.access_token);
            cb.call(this, null);
          } catch (err) {
            cb.call(this, err);
          }
        }.bind(this));
      }.bind(this));
    },

    /**
     * Retrieves all Google Contacts from currently authenticated user.
     *
     * @param  {Function} cb Callback
     */
    all: function(cb) {
      if (!this.token)
        return cb.call(this, new Error("Missing token, please authorize."));
      var request = new XMLHttpRequest();
      request.onreadystatechange = function(event) {
        var request = event.target;
        if (request.readyState !== 4)
          return;
        if (request.status !== 200)
          return cb.call(this, new Error(request.statusText));
        cb.call(this, null, _normalize(JSON.parse(request.responseText)));
      }.bind(this);
      request.onerror = function() {
        // XXX: todo
        console.error("XHR FAIL", arguments);
      }.bind(this);
      request.open("GET", baseUrl + encodeURIComponent(this.token), true);
      request.send();
    },

    /**
     * Retrieves stored Google API authentication token if it exists.
     * @return {String|undefined}
     */
    _getToken: function() {
      return $.cookie(AUTH_COOKIE_NAME);
    },

    /**
     * Stores a Google Authentication token in a cookie.
     *
     * @param  {String}   token Authntication token
     */
    _storeToken: function(token) {
      if (!token)
        throw new Error("Can't store a missing auth token.");
      this.token = token;
      $.cookie(AUTH_COOKIE_NAME, token, {expires: 365 * 10});
    }
  };

  return GoogleContacts;
})();
