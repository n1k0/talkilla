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

  DB.prototype = {
    /**
     * Loads the database.
     *
     * @param  {Function} cb Callback
     *
     * Callback parameters:
     * - {Error|null} err: Encountered error, if any
     * - {IDBDatabase} db: indexedDB database object
     */
    load: function(cb) {
      if (this.db)
        return cb.call(this, null, this.db);
      var request = indexedDB.open(this.options.dbname, this.options.version);
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
     * Adds a new record to the database. Automatically opens the database
     * connexion if needed.
     *
     * @param {Object}   record   Record
     * @param {Function} cb       Callback
     * @param {Object}   options  Options
     *
     * Callback parameters:
     * - {Error|null} err:    Encountered error, if any
     * - {String}     record: Inserted record
     *
     * Options:
     * - {Boolean}:   silentConstraint: Silent constraint error?
     */
    add: function(record, cb, options) {
      this.load(function(err) {
        if (err)
          return cb.call(this, err);
        var request = this._getStore("readwrite").add(record);
        request.onsuccess = function() {
          cb.call(this, null, record);
        }.bind(this);
        request.onerror = function(event) {
          var err = event.target.error;
          var silentConstraint = options && options.silentConstraint;
          if (err && err.name === "ConstraintError" && silentConstraint) {
            event.preventDefault();
            return cb.call(this, null, record);
          }
          cb.call(this, err);
        }.bind(this);
      }.bind(this));
    },

    /**
     * Adds or create a new record into the database. Automatically opens the
     * database connexion if needed.
     *
     * @param {Object}   record   Record
     * @param {Function} cb       Callback
     * @param {Object}   options  Options
     *
     * Callback parameters:
     * - {Error|null} err:    Encountered error, if any
     * - {String}     record: Inserted record
     */
    put: function(record, cb) {
      this.load(function(err) {
        if (err)
          return cb.call(this, err);
        var request = this._getStore("readwrite").put(record);
        request.onsuccess = function() {
          cb.call(this, null, record);
        }.bind(this);
        request.onerror = function(event) {
          cb.call(this, event.target.error);
        }.bind(this);
      }.bind(this));
    },

    /**
     * Retrieves the record matching the provided key. Automatically opens the
     * database connexion if needed.
     *
     * @param {String}   key  Key
     * @param {Function} cb   Callback
     *
     * Callback parameters:
     * - {Error|null} err:    Encountered error, if any
     * - {String}     record: Matching record
     */
    get: function(index, key, cb) {
      this.load(function(err) {
        if (err)
          return cb.call(this, err);
        var store = this._getStore("readonly").index("foo");
        var request = store.get(key);
        request.onerror = function(event) {
          cb.call(this, event.target.errorCode);
        }.bind(this);
        request.onsuccess = function(event) {
          if (typeof event.target.result === 'undefined')
            return cb.call(this, new Error("No record found, key=" + key));
          cb.call(this, null, event.target.result);
        }.bind(this);
      });
    },

    /**
     * Retrieves all records from the database. Automatically opens the
     * database connexion if needed.
     *
     * @param  {Function} cb Callback
     *
     * Callback parameters:
     * - {Error|null} err:     Encountered error, if any
     * - {Array}      records: Records list
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
     * Creates object store. Must me overidden to define an actual data schema.
     *
     * @abstract
     * @param  {IDBDatabase}    db indexedDB database
     * @return {IDBObjectStore}
     */
    _createStore: function() {
      throw new Error("You must implement _createStore() to create a store");
    },

    /**
     * Retrieve current object store.
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
