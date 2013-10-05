/* jshint unused:false */

/**
 * Tiny abstraction on top of indexedDB. Currently supports a single store in
 * the database.
 */
var DB = (function() {
  var ON_BLOCKED_MAX_RETRIES = 10;

  /**
   * Constructor.
   *
   * @param {Object} options Options
   *
   * Available options:
   * - {String} dbname: indexedDB database name
   * - {String} storename: indexedDB database store name
   * - {Number} version: indexedDB database version number (default: 1)
   */
  function DB(options) {
    options = options || {};
    if (!options.dbname)
      throw new Error("Missing required parameter: dbname");
    if (!options.storename)
      throw new Error("Missing required parameter: storename");
    this.options = {
      dbname: options.dbname,
      storename: options.storename,
      version: options.version || 1
    };
    this.db = undefined;
  }

  /**
   * Loads the database.
   *
   * @param  {Function} cb Callback
   *
   * Callback parameters:
   * - {Error|null} err: Encountered error, if any
   * - {IDBDatabase} db: indexedDB database object
   */
  DB.prototype = {
    load: function(cb) {
      if (this.db)
        return cb.call(this, null, this.db);
      var request = indexedDB.open(this.options.dbname, this.options.dbversion);
      request.onblocked = function(event) {
        cb.call(this, event.target.error);
      }.bind(this);
      request.onerror = function(event) {
        cb.call(this, event.target.errorCode);
      }.bind(this);
      request.onupgradeneeded = function(event) {
        // the callback will be called by the onsuccess event handler when the
        // whole operation is performed
        this._createStore(event.target.result);
      }.bind(this);
      request.onsuccess = function(event) {
        this.db = event.target.result;
        cb.call(this, null, this.db);
      }.bind(this);
    },

    /**
     * Retrieves all contacts from the database. Automatically opens the
     * database connexion if needed.
     *
     * @param  {Function} cb Callback
     *
     * Callback parameters:
     * - {Error|null} err:      Encountered error, if any
     * - {Array}      contacts: Contacts list
     */
    all: function(cb) {
      this.load(function(err) {
        if (err)
          return cb.call(this, err);
        var cursor = this._getStore("readonly").openCursor(),
            records = [];
        cursor.onerror = function(event) {
          cb.call(this, event.target.errorCode);
        }.bind(this);
        cursor.onsuccess = function(event) {
          var cursor = event.target.result;
          if (!cursor)
            return cb.call(this, null, records);
          records.unshift(cursor.value);
          /* jshint -W024 */
          return cursor.continue();
        }.bind(this);
      });
    },

    /**
     * Closes the indexedDB database.
     */
    close: function() {
      if (!this.db)
        return;
      this.db.close();
      delete this.db;
    },

    /**
     * Drops the indexedDB database.
     *
     * @param  {Function} cb Callback
     *
     * Callback parameters:
     * - {Error|null} err:  Encountered error, if any
     */
    drop: function(cb) {
      var attempt = 0;
      this.close();
      var request = indexedDB.deleteDatabase(this.options.dbname);
      request.onsuccess = function() {
        cb.call(this, null);
      }.bind(this);
      request.onerror = function(event) {
        cb.call(this, event.target.errorCode);
      }.bind(this);
      request.onblocked = function(event) {
        // trigger an error if max number of attempts has been reached
        if (attempt >= ON_BLOCKED_MAX_RETRIES)
          return cb.call(this, new Error("Unable to drop a blocked database " +
                                         "after " + attempt + "attempts"));
        // reschedule another attempt for next tick
        setTimeout(this.drop.bind(this, cb), 0);
        attempt++;
      }.bind(this);
    },

    /**
     * Retrieve current contact object store.
     *
     * @param  {String} mode Access mode - "readwrite" or "readonly")
     * @return {IDBObjectStore}
     */
    _getStore: function(mode) {
      return this.db.transaction(this.options.storename, mode)
                    .objectStore(this.options.storename);
    }
  };

  return DB;
})();
