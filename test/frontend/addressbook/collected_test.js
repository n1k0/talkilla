/*global sinon, chai, CollectedContacts, IDBDatabase, IDBObjectStore */
/* jshint expr:true */

var expect = chai.expect;

describe("CollectedContacts", function() {
  var sandbox, contactsDb;

  beforeEach(function() {
    sandbox = sinon.sandbox.create();
    contactsDb = new CollectedContacts({
      dbname: "TalkillaContactsTest"
    });
  });

  afterEach(function(done) {
    sandbox.restore();
    contactsDb.drop(function() {
      done();
    });
  });

  describe("#constructor", function() {
    it("should construct an object", function() {
      expect(contactsDb).to.be.a("object");
    });

    it("should set default options", function() {
      expect(contactsDb.options).to.include.keys(
        "dbname", "storename", "version");
      expect(contactsDb.options.storename).eql("contacts");
      expect(contactsDb.options.version).eql(1);
    });
  });

  describe("#load", function() {
    it("should load the database", function(done) {
      contactsDb.load(function(err, db) {
        expect(err).to.be.a("null");
        expect(db).to.be.an.instanceOf(IDBDatabase);
        expect(contactsDb.db).to.be.an.instanceOf(IDBDatabase);
        expect(contactsDb.db).to.deep.equal(db);
        done();
      });
    });

    it("shouldn't throw if the database is already loaded", function(done) {
      contactsDb.load(function(db1) {
        contactsDb.load(function(db2) {
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
      contactsDb.load(function(err) {
        expect(err).eql("load error");
        done();
      });
    });
  });

  describe("#addUsername", function() {
    it("should add a record to the database", function(done) {
      contactsDb.addUsername("florian", function(err, username) {
        expect(err).to.be.a("null");
        expect(username).eql("florian");
        this.allUsernames(function(err, contacts) {
          expect(contacts).eql(["florian"]);
          done();
        });
      });
    });

    it("shouldn't raise an error in case of a duplicate contact",
      function(done) {
        contactsDb.addUsername("niko", function(err) {
          expect(err).to.be.a("null");
          this.addUsername("niko", function(err) {
            expect(err).to.be.a("null");
            done();
          });
        });
      });

    it("should pass back any encountered error", function(done) {
      sandbox.stub(IDBObjectStore.prototype, "add", function() {
        var request = {};
        setTimeout(function() {
          request.onerror({target: {error: {name: "InvalidStateError",
                                            message: "add error"}}});
        });
        return request;
      });
      contactsDb.addUsername("foo", function(err) {
        expect(err.message).eql("add error");
        done();
      });
    });
  });

  describe("#allUsernames", function() {
    it("should retrieve no record when db is empty", function(done) {
      contactsDb.allUsernames(function(err, contacts) {
        expect(contacts).to.have.length.of(0);
        done();
      });
    });

    it("should retrieve all contacts", function(done) {
      contactsDb.addUsername("niko", function() {
        this.addUsername("jb", function() {
          this.allUsernames(function(err, contacts) {
            expect(err).to.be.a("null");
            expect(contacts).to.have.length.of(2);
            expect(contacts).to.contain("niko");
            expect(contacts).to.contain("jb");
            done();
          });
        });
      });
    });

    it("should preserve the order of insertion", function(done) {
      contactsDb.addUsername("niko", function() {
        this.addUsername("jb", function() {
          this.allUsernames(function(err, contacts) {
            expect(contacts).eql(["niko", "jb"]);
            done();
          });
        });
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
      contactsDb.allUsernames(function(err) {
        expect(err).eql("all error");
        done();
      });
    });
  });

  describe("#close", function() {
    it("should close the database", function() {
      contactsDb.close();
      expect(contactsDb.db).to.be.a("undefined");
    });
  });

  describe("#drop", function() {
    it("should drop the database", function(done) {
      contactsDb.addUsername("niko", function() {
        this.drop(function(err) {
          expect(err).to.be.a("null");
          this.allUsernames(function(err, contacts) {
            expect(contacts).to.have.length.of(0);
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
      contactsDb.drop(function(err) {
        expect(err).eql("drop error");
        done();
      });
    });
  });
});
