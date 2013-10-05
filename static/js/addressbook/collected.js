/* global DB */
/* jshint unused:false */

/**
 * Local contacts database powered by indexedDB.
 */
var CollectedContacts = (function() {
  /**
   * Constructor.
   *
   * @param {Object} options Options
   * @see   DB#constructor
   */
  function CollectedContacts(options) {
    options.storename = "contacts";
    DB.call(this, options);
  }

  // inherits from DB
  CollectedContacts.prototype = Object.create(DB.prototype);

  /**
   * Adds a new contact username to the database.
   *
   * @param {String}   username Contact username
   * @param {Function} cb       Callback
   *
   * Callback parameters:
   * - {Error|null} err:      Encountered error, if any
   * - {Array}      username: Inserted contact username
   */
  CollectedContacts.prototype.addUsername = function(username, cb) {
    this.add({username: username}, function(err, record) {
      if (err)
        return cb.call(this, err);
      cb.call(this, null, record.username);
    }.bind(this), {silentConstraint: true});
  };

  /**
   * Retrieves all contacts from the database.
   *
   * @param  {Function} cb Callback
   *
   * Callback parameters:
   * - {Error|null} err:      Encountered error, if any
   * - {Array}      contacts: Contacts list
   */
  CollectedContacts.prototype.allUsernames = function(cb) {
    this.all(function(err, records) {
      if (err)
        return cb.call(this, err);
      cb.call(this, null, records.map(function(record) {
        return record.username;
      }));
    }.bind(this));
  };

  /**
   * Creates the object store for contacts.
   *
   * @param  {IDBDatabase}    db indexedDB database
   * @return {IDBObjectStore}
   */
  CollectedContacts.prototype._createStore = function(db) {
    var store = db.createObjectStore(this.options.storename, {
      keyPath: "username"
    });
    store.createIndex("username", "username", {unique: true});
    return store;
  };

  return CollectedContacts;
})();
