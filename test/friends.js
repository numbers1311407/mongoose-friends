var mongoose = require("mongoose")
  , _ = require('underscore')
  , friends = require("../")
  , Status = friends.Status


// mongoose.set("debug", true);

/**
 * collection name for our test collection
 */
var collName = "friendtestusers";


/**
 * path name for the friends array on the model
 */
var pathname = "_foobars";

/**
 * Connect to test
 */
mongoose.connect("mongodb://localhost/test")


/**
 * Create a dummy user schema
 */
var UserSchema = new mongoose.Schema({
  name: String
})

UserSchema.plugin(friends({pathName: pathname}));

var User = mongoose.model("User", UserSchema, collName);


/**
 *
 */
suite("friends", function() {
  var u1, u2;

  setup(function(done) {
    u1 = new User({name: "Alice"})
    u2 = new User({name: "Roger"})
    User.remove(function () {
      User.create([u1, u2], done);
    });
  });

  suite("requesting friends", function() {
    suite(".requestFriend", function () {
      setup(function (done) {
        User.requestFriend(u1, u2, done);
      });
      // test the basic behavior
      requestFriendBehavior();

      test("requesting a 2nd time should have no effect", function (done) {
        User.requestFriend(u1, u2, function (err, fships) {
          fships.friender.status.should.eql(Status.Requested);

          User.findOne(u2._id, pathname, function (err, doc) {
            doc[pathname].length.should.eql(1);
            doc[pathname].id(u1.id).status.should.eql(Status.Pending);
            done();
          });
        });
      });

      test("request by requested should accept friendship on both sides", function (done) {
        User.requestFriend(u2, u1, function (err, fships) {
          fships.friender.status.should.eql(Status.Accepted);

          User.findById(u1._id, pathname, function (err, doc) {
            doc[pathname].id(u2.id).status.should.eql(Status.Accepted);
            User.findById(u2._id, pathname, function (err, doc) {
              doc[pathname].id(u1.id).status.should.eql(Status.Accepted);
              done();
            });
          });
        });
      });

      suite("when requestee has already accepted", function () {
        setup(function (done) {
          var query = {_id: u2._id};
          query[pathname] = {$elemMatch: {_id: u1._id}};

          var update = {$set: {}};
          update.$set[pathname+".$.status"] = Status.Accepted;

          User.findOneAndUpdate(query, update, done);
        });

        test("re-requesting should accept friendship on both sides", function (done) {
          User.requestFriend(u1, u2, function (err, fships) {
            fships.friender.status.should.eql(Status.Accepted);

            User.findById(u1._id, pathname, function (err, doc) {
              doc[pathname].id(u2.id).status.should.eql(Status.Accepted);
              User.findById(u2._id, pathname, function (err, doc) {
                doc[pathname].id(u1.id).status.should.eql(Status.Accepted);
                done();
              });
            });
          });
        });
      });

      suite("when requestee has requested requester", function () {
        setup(function (done) {
          var query = {_id: u2._id};
          query[pathname] = {$elemMatch: {_id: u1._id}};

          var update = {$set: {}};
          update.$set[pathname+".$.status"] = Status.Requested;

          User.findOneAndUpdate(query, update, done);
        });

        test("re-requesting should accept friendship on both sides", function (done) {
          User.requestFriend(u1, u2, function (err, fships) {
            fships.friender.status.should.eql(Status.Accepted);

            User.findById(u1._id, pathname, function (err, doc) {
              doc[pathname].id(u2.id).status.should.eql(Status.Accepted);
              User.findById(u2._id, pathname, function (err, doc) {
                doc[pathname].id(u1.id).status.should.eql(Status.Accepted);
                done();
              });
            });
          });
        });
      });
    });

    suite("#requestFriend", function () {
      setup(function (done) {
        var test = this;
        u1.requestFriend(u2, done);
      });
      requestFriendBehavior();
    });

    function requestFriendBehavior () {
      test("requester should have requested friend request", function (done) {
        User.findById(u1._id, pathname, function (err, doc) {
          doc[pathname].id(u2.id).status.should.eql(Status.Requested);
          done();
        });
      });

      test("requestee should have pending friend request", function (done) {
        User.findById(u2._id, pathname, function (err, doc) {
          doc[pathname].id(u1.id).status.should.eql(Status.Pending);
          done();
        });
      });
    }
  });

  suite("getting friends", function () {
    setup(function (done) {
      User.requestFriend(u1, u2, done);
    });

    suite(".getFriends", function () {
      getFriendBehavior(true);
    });

    suite("#getFriends", function () {
      getFriendBehavior();
    });

    function getFriendBehavior(isStatic) {
      var shouldHave = function (friend, status, user2) {
        return function (done) {
          var user, other;
          if (user2) {
            user = u2; other = u1;
          } else {
            user = u1; other = u2;
          }
          var cb = function (err, friends) {
            if (friend) {
              friends.length.should.eql(1);
              friends[0].friend._id.should.eql(other._id);
            } else {
              friends.length.should.eql(0);
            }
            done();
          }

          if (isStatic) {
            User.getFriends(user, {status: status}, cb)
          } else {
            user.getFriends({status: status}, cb);
          }
        }
      }

      suite("after request made", function () {
        suite("requester", function () {
          test("should have 1 requested friend (requestee)", shouldHave(1, Status.Requested))
          test("should have 0 accepted friends", shouldHave(0, Status.Accepted))
          test("should have 0 pending friends", shouldHave(0, Status.Pending))
        });

        suite("requestee", function () {
          test("should have 0 requested friend", shouldHave(0, Status.Requested, 1))
          test("should have 0 accepted friends", shouldHave(0, Status.Accepted, 1))
          test("should have 1 pending friends (requester)", shouldHave(1, Status.Pending, 1))
        });
      });

      suite("after request accepted", function () {
        setup(function (done) {
          User.requestFriend(u2, u1, done);
        });

        suite("requester", function () {
          test("should have 1 accepted friend (requestee)", shouldHave(1, Status.Accepted))
        });

        suite("requestee", function () {
          test("should have 1 accepted friend (requester)", shouldHave(1, Status.Accepted, 1))
        });
      });
    }
  });

  suite("removing friends", function () {
    setup(function (done) {
      User.requestFriend(u1, u2, function () {
        User.requestFriend(u2, u1, done);
      });
    });

    suite(".removeFriendship", function () {
      setup(function (done) {
        User.removeFriendship(u1, u2, done);
      })
      removeFriendBehavior();
    })

    suite("#removeFriend", function () {
      setup(function (done) {
        u1.removeFriend(u2, done);
      })
      removeFriendBehavior();
    })

    function removeFriendBehavior() {
      test("remover should have no friendship", function (done) {
        User.getFriends(u1, function (err, friends) {
          friends.length.should.eql(0);
          done();
        });
      });

      test("removee should no longer have friendship", function (done) {
        User.getFriends(u2, function (err, friends) {
          friends.length.should.eql(0);
          done();
        });
      });
    }
  });

  suiteTeardown(function(done) {
    mongoose.connection.db.dropCollection(collName, done);
  });
});
