/* global contra, gapi */
/* jshint unused:false, camelcase:false */
/**
 * Google Contacts API helper.
 */
var GoogleContacts = (function() {
  "use strict";

  var AUTH_COOKIE_NAME = "google.auth.token";
  var AUTH_COOKIE_TTL = 365 * 10; // in days
  var MAX_RESULTS = 9999; // max number of contacts to fetch
  var config = {
    // This is a Talkilla specific client id.
    "client_id": "122170353410.apps.googleusercontent.com",
    "scope":     "https://www.google.com/m8/feeds"
  };
  var baseUrl = config.scope + "/contacts/default/full?v=3.0&alt=json";

  function buildUrl(params) {
    return [baseUrl, Object.keys(params || {}).map(function(name) {
      var value = params[name];
      return name + (value !== undefined ? "=" + value : "");
    }).join("&")].join("&");
  }

  /**
   * Constructor.
   *
   * @param {Object} options Options:
   * - {AppPort} appPort       AppPort object for communication to the SocialAPI
   * - {String} authCookieName Authentication token cookie name
   * - {String} token          Authentication token
   */
  function GoogleContacts(options) {
    options = options || {};
    this.appPort = options.appPort;
    this.authCookieName = options.authCookieName || AUTH_COOKIE_NAME;
    this.authCookieTTL = options.authCookieTTL || AUTH_COOKIE_TTL;
    this.maxResults = options.maxResults || MAX_RESULTS;
    this.token = options.token || this._getToken();
  }

  /**
   * Contacts data importer.
   * @param {Object} feedData Google Contacts Data Feed
   */
  GoogleContacts.Importer = function(dataFeed, token) {
    this.dataFeed = dataFeed;
    this.token = token;
  };

  GoogleContacts.Importer.prototype = {
    _buildAvatarProxyUrl: function(contact) {
      // contact.link is an array of link objects
      var link = (contact.link || []).filter(function(link) {
        return link.type.indexOf("image") === 0;
      }).shift();
      if (!link)
        return;
      var match = /feeds\/photos\/media\/(.*)\/(.*)\?/.exec(link.href);
      if (!match)
        return;
      return ["/proxy/google/avatar/", match[1], "/", match[2],
              "?token=" + encodeURIComponent(this.token)].join("");
    },

    _fetchAvatarData: function(contact, cb) {
      var request = new XMLHttpRequest();
      request.responseType = "blob";
      request.onload = function(event) {
        var request = event && event.target;
        // sinon might pass us an empty event here
        if (!request || request.readyState !== 4)
          return;
        if (request.status === 404) // no picture for this contact
          return cb.call(this, null);
        if (request.status !== 200) {
          return cb.call(this, new Error("Fetching contact avatar failed: " +
                                         request.statusText));
        }
        try {
          cb.call(this, null, request.response);
        } catch (err) {
          cb.call(this, err);
        }
      }.bind(this);
      request.onerror = function(event) {
        cb.call(this, new Error("HTTP " + event.target.status + " error"));
      }.bind(this);
      request.open("GET", this._buildAvatarProxyUrl(contact), true);
      request.send();
    },

    _fetchAvatars: function(contacts, cb) {
      contra.map(contacts, function(contact, cb) {
        this._fetchAvatarData(contact, function(err, avatarBlob) {
          if (err)
            return cb(err);
          contact.avatar = avatarBlob;
          cb(null, contact);
        });
      }.bind(this), cb);
    },

    _normalize: function(id) {
      var keyField, getUsername;

      // XXX: we shouldn't be doing this, really
      if (id === "email") {
        keyField = "gd$email";
        getUsername = function(email) {
          return email.address;
        };
      } else if (id === "phoneNumber") {
        keyField = "gd$phoneNumber";
        getUsername = function(item) {
          return item.$t;
        };
      }

      return this.dataFeed.feed.entry.reduce(function(contacts, entry) {
        if (!entry[keyField])
          return contacts;
        return contacts.concat(entry[keyField].map(function(key) {
          var contact = {username: getUsername(key)};
          if (entry.gd$name && entry.gd$name.gd$fullName &&
              entry.gd$name.gd$fullName.$t)
            contact.fullName = entry.gd$name.gd$fullName.$t;
          return contact;
        }));
      }, []);
    },

    /**
     * Extracts contact information (email addresses, phone numbers, avatars)
     * from current data feed.
     *
     * @param  {String}   id  What should be considered the unique identifier
                              (Should be "phoneNumber" or "email").
     * @param  {Function} cb  Callback(error, contacts)
     * @return {Array}
     */
    import: function(id, cb) {
      this._fetchAvatars(this._normalize(id), cb);
    }
  };

  GoogleContacts.prototype = {
    /**
     * Initialises oauth for the popup window avoidance
     */
    initialize: function(cb) {
      if (typeof gapi !== "object")
        return cb && cb(new Error("gapi is missing"));

      // Init the google auth api now, because this needs to be done
      // before any button click for authorization.
      try {
        gapi.auth.init(cb);
      } catch (x) {
        console.log("Google Contacts API failed to initialize correctly");
      }
    },

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

      gapi.auth.authorize(config, function(auth) {
        try {
          this._storeToken(auth.access_token);
          cb.call(this, null);
        } catch (err) {
          cb.call(this, err);
        }
      }.bind(this));
    },

    /**
     * Retrieves all Google Contacts from currently authenticated user.
     *
     * @param  {String} contactIdentifier. Describes what should be used as the
     *                  contact identifier. Should be either "phoneNumber" or
     *                  "email".
     * @param  {Function} cb Callback
     */
    all: function(contactIdentifier, cb) {
      if (!this.token)
        return cb.call(this, new Error("Missing token, please authorize."));
      // XXX: we should reuse worker http.js here - need to adapt it though
      var request = new XMLHttpRequest();
      request.onload = function(event) {
        var request = event && event.target, contacts;
        // sinon might pass us an empty event here
        if (!request || request.readyState !== 4)
          return;
        if (request.status !== 200)
          return cb.call(this, new Error(request.statusText));
        try {
          var feed = JSON.parse(request.responseText);
          new GoogleContacts.Importer(feed, this.token)
                            .import(contactIdentifier, cb);
        } catch (err) {
          var message = "Unable to parse & import Google contacts feed: " + err;
          cb.call(this, new Error(message));
        }
      }.bind(this);
      request.onerror = function(event) {
        cb.call(this, new Error("HTTP " + event.target.status + " error"));
      }.bind(this);
      request.open("GET", buildUrl({
        "max-results": this.maxResults,
        "access_token": encodeURIComponent(this.token)
      }), true);
      request.send();
    },

    /**
     * Loads contacts from the Google Contacts API and notify current opened
     * AppPort through the `talkilla.contacts` event.
     *
     * Emits `talkilla.contacts-error` on any encountered error.
     *
     * @param  {String} contactIdentifier. Describes what should be used as the
     *                  contact identifier. Should be either "phoneNumber" or
     *                  "email".
     */
    loadContacts: function(contactIdentifier) {
      this.authorize(function(err) {
        if (err)
          return this.appPort.post("talkilla.contacts-error", err);
        this.all(contactIdentifier, function(err, contacts) {
          if (err)
            return this.appPort.post("talkilla.contacts-error", err);
          this.appPort.post("talkilla.contacts", {
            contacts: contacts,
            source: "google"
          });
        }.bind(this));
      }.bind(this));
    },

    /**
     * Retrieves stored Google API authentication token if it exists.
     *
     * @return {String|undefined}
     */
    _getToken: function() {
      return $.cookie(this.authCookieName);
    },

    /**
     * Stores a Google Authentication token in a cookie.
     *
     * @param  {String} token Authentication token
     */
    _storeToken: function(token) {
      if (!token)
        throw new Error("Can't store a missing auth token.");
      this.token = token;
      $.cookie(this.authCookieName, token, {expires: this.authCookieTTL});
    }
  };

  return GoogleContacts;
})();
