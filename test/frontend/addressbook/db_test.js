/*global sinon, chai, DB, IDBDatabase, IDBObjectStore */
/* jshint expr:true */

var expect = chai.expect;

describe("DB", function() {
  var sandbox;

  function createTestDB(options, _createStore) {
    function TestDB() {
      DB.apply(this, arguments);
    }
    TestDB.prototype = Object.create(DB.prototype);
    TestDB.prototype._createStore = _createStore;
    return new TestDB(options);
  }

  beforeEach(function() {
    sandbox = sinon.sandbox.create();
  });

  afterEach(function() {
    sandbox.restore();
  });

  describe("#constructor", function() {
    it("should construct an object", function() {
      var testDB = createTestDB({
        dbname: "test",
        storename: "test"
      }, function(){});
      expect(testDB).to.be.a("object");
    });

    it("should raise an error if no dbname option is passed", function() {
      expect(createTestDB.bind(null, {storename: "test"})).to.Throw(/dbname/);
    });

    it("should raise an error if no storename option is passed", function() {
      expect(createTestDB.bind(null, {dbname: "test"})).to.Throw(/storename/);
    });

    it("should set default options", function() {
      var testDB = createTestDB({dbname: "foo", storename: "bar", version: 2});
      expect(testDB.options).to.include.keys("dbname", "storename", "version");
      expect(testDB.options.dbname).eql("foo");
      expect(testDB.options.storename).eql("bar");
      expect(testDB.options.version).eql(2);
    });
  });

  describe("constructed", function() {
    var testDB;

    beforeEach(function() {
      testDB = createTestDB({dbname: "test", storename: "test"}, function(db) {
        var store = db.createObjectStore(this.options.storename, {
          keyPath: "foo"
        });
        store.createIndex("foo", "foo", {unique: true});
      });
    });

    afterEach(function(done) {
      testDB.drop(function() {
        done();
      });
    });

    describe("#load", function() {
      it("should load the database", function(done) {
        testDB.load(function(err, db) {
          expect(err).to.be.a("null");
          expect(db).to.be.an.instanceOf(IDBDatabase);
          expect(testDB.db).to.be.an.instanceOf(IDBDatabase);
          expect(testDB.db).to.deep.equal(db);
          done();
        });
      });

      it("shouldn't throw if the database is already loaded", function(done) {
        testDB.load(function(db1) {
          testDB.load(function(db2) {
            expect(db1).eql(db2);
            done();
          });
        });
      });

      it("should pass back any encountered error", function(done) {
        sandbox.stub(indexedDB, "open", function() {
          var request = {};
          setTimeout(function() {
            request.onerror({target: {errorCode: "load error"}});
          });
          return request;
        });
        testDB.load(function(err) {
          expect(err).eql("load error");
          done();
        });
      });
    });

    describe("#add", function() {
      it("should add a record to the database", function(done) {
        var test = {foo: "bar"};
        testDB.add(test, function(err, record) {
          expect(err).to.be.a("null");
          expect(record).eql(test);
          this.all(function(err, records) {
            expect(records).eql([test]);
            done();
          });
        });
      });

      it("shouldn't raise an error in case of a duplicate record if the " +
         "`silentConstraint` option is enabled",
        function(done) {
          var test = {foo: "bar"};
          testDB.add(test, function(err) {
            expect(err).to.be.a("null");
            this.add(test, function(err) {
              expect(err).to.be.a("null");
              done();
            }, {silentConstraint: true});
          });
        });

      it("should pass back any load error", function(done) {
        sandbox.stub(indexedDB, "open", function() {
          var request = {};
          setTimeout(function() {
            request.onerror({target: {errorCode: "load error"}});
          });
          return request;
        });
        testDB.add({foo: "bar"}, function(err) {
          expect(err).eql("load error");
          done();
        });
      });

      it("should pass back any add error", function(done) {
        var test = {foo: "bar"};
        sandbox.stub(IDBObjectStore.prototype, "add", function() {
          var request = {};
          setTimeout(function() {
            request.onerror({target: {error: {name: "InvalidStateError",
                                              message: "add error"}}});
          });
          return request;
        });
        testDB.add(test, function(err) {
          expect(err.message).eql("add error");
          done();
        });
      });
    });

    describe("#put", function() {
      it("should create a record into the database if it doesn't exist yet",
        function(done) {
          var test = {foo: "bar"};
          testDB.put(test, function(err, record) {
            expect(err).to.be.a("null");
            expect(record).eql(test);
            this.all(function(err, records) {
              expect(records).eql([test]);
              done();
            });
          });
        });

      it("shouldn't create a new record if it already exist", function(done) {
        var test = {foo: "bar"};
        testDB.add(test, function(err) {
          this.put(test, function(err) {
            expect(err).to.be.a("null");
            this.all(function(err, records) {
              expect(records).to.have.length.of(1);
              expect(records).eql([test]);
              done();
            });
          });
        });
      });

      it("should pass back any load error", function(done) {
        sandbox.stub(indexedDB, "open", function() {
          var request = {};
          setTimeout(function() {
            request.onerror({target: {errorCode: "load error"}});
          });
          return request;
        });
        testDB.put({foo: "bar"}, function(err) {
          expect(err).eql("load error");
          done();
        });
      });

      it("should pass back any put error", function(done) {
        var test = {foo: "bar"};
        sandbox.stub(IDBObjectStore.prototype, "put", function() {
          var request = {};
          setTimeout(function() {
            request.onerror({target: {error: {name: "InvalidStateError",
                                              message: "put error"}}});
          });
          return request;
        });
        testDB.put(test, function(err) {
          expect(err.message).eql("put error");
          done();
        });
      });
    });

    describe("#get", function() {
      it("should retrieve an existing record", function(done) {
        var test = {foo: "bar"};
        testDB.add(test, function() {
          this.get("foo", "bar", function(err, record) {
            expect(err).to.be.a("null");
            expect(record).eql(test);
            done();
          });
        });
      });

      it("should pass back an error if no record was found", function(done) {
        var test = {foo: "bar"};
        testDB.add(test, function() {
          this.get("foo", "baz", function(err, record) {
            expect(err).to.be.an.instanceOf(Error);
            done();
          });
        });
      });

      it("should pass back any load error", function(done) {
        sandbox.stub(indexedDB, "open", function() {
          var request = {};
          setTimeout(function() {
            request.onerror({target: {errorCode: "load error"}});
          });
          return request;
        });
        testDB.get("foo", "bar", function(err) {
          expect(err).eql("load error");
          done();
        });
      });
    });

    describe("#all", function() {
      it("should retrieve no record when db is empty", function(done) {
        testDB.all(function(err, records) {
          expect(records).to.have.length.of(0);
          done();
        });
      });

      it("should retrieve all records in inserted order", function(done) {
        var test1 = {foo: "bar"};
        var test2 = {foo: "baz"};
        testDB.add(test1, function() {
          this.add(test2, function() {
            this.all(function(err, records) {
              expect(err).to.be.a("null");
              expect(records).to.have.length.of(2);
              // XXX: chai doesn't seem to be able to check if an array contains
              // an object:
              // expect([{a: 1}, {b: 2}]).to.contain({a: 1}) //=> AssertionError
              var mapped = records.map(function(record) {return record.foo;});
              expect(mapped).to.contain(test1.foo);
              expect(mapped).to.contain(test2.foo);
              done();
            });
          });
        });
      });

      it("should pass back any load error", function(done) {
        sandbox.stub(indexedDB, "open", function() {
          var request = {};
          setTimeout(function() {
            request.onerror({target: {errorCode: "load error"}});
          });
          return request;
        });
        testDB.all(function(err) {
          expect(err).eql("load error");
          done();
        });
      });

      it("should pass back any encountered error", function(done) {
        sandbox.stub(IDBObjectStore.prototype, "openCursor", function() {
          var cursor = {};
          setTimeout(function() {
            cursor.onerror({target: {errorCode: "all error"}});
          });
          return cursor;
        });
        testDB.all(function(err) {
          expect(err).eql("all error");
          done();
        });
      });
    });

    describe("#close", function() {
      it("should close the database", function() {
        testDB.close();
        expect(testDB.db).to.be.a("undefined");
      });
    });

    describe("#drop", function() {
      it("should drop the database", function(done) {
        testDB.add({foo: "bar"}, function() {
          this.drop(function(err) {
            expect(err).to.be.a("null");
            this.all(function(err, records) {
              expect(records).to.have.length.of(0);
              done();
            });
          });
        });
      });

      it("should pass back any encountered error", function(done) {
        sandbox.stub(indexedDB, "deleteDatabase", function() {
          var request = {};
          setTimeout(function() {
            request.onerror({target: {errorCode: "drop error"}});
          });
          return request;
        });
        testDB.drop(function(err) {
          expect(err).eql("drop error");
          done();
        });
      });
    });
  });
});
