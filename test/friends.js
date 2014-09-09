var mongoose = require("mongoose")
  , _ = require('underscore')
  , friends = require("../")
  , Status = friends.Status
  , async = require("async")
  , assert = require("assert")
  , should = require("should")


// mongoose.set("debug", true);

/**
 * collection name for our test collection
 */
var collName = "friendtestusers";


/**
 * path name for the friends array on the model
 */
var pathname = "foobars";

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

  function ensureUsers(done) {
    u1 = new User({name: "Alice"})
    u2 = new User({name: "Roger"})
    User.remove(function () {
      User.create([u1, u2], done);
    });
  }

  setup(ensureUsers);

  suite("requesting friends", function() {
    suite(".requestFriend", function () {
      setup(function (done) {
        User.requestFriend(u1, u2, done);
      });
      // test the basic behavior
      requestFriendBehavior();

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

      test("requesting a 2nd time should have no effect", function (done) {
        User.requestFriend(u1, u2, function (err, fships) {
          fships.friender.status.should.eql(Status.Requested);
          User.findById(u2._id, pathname, function (err, doc) {
            doc[pathname].length.should.eql(1);
            doc[pathname].id(u1._id).status.should.eql(Status.Pending);
            done();
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

    suite("status helpers", function () {
      function check(type, user, len, instance) {
        return function (done) {
          user = user ? u1 : u2;

          var cb = function (err, f) {
            f.length.should.eql(len);
            done();
          }

          if (instance) {
            user["get"+type+"Friends"](cb);
          } else {
            User["get"+type+"Friends"](user, cb);
          }
        }
      }

      suite("after request", function () {
        suite(".getPendingFriends", function () {
          test("requester should have 0", check('Pending', 1, 0))
          test("requestee should have 1", check('Pending', 0, 1))
        })
        suite("#getPendingFriends", function () {
          test("requester should have 0", check('Pending', 1, 0, 1))
          test("requestee should have 1", check('Pending', 0, 1, 1))
        })
        suite(".getAcceptedFriends", function () {
          test("requester should have 0", check('Accepted', 1, 0))
          test("requestee should have 0", check('Accepted', 0, 0))
        })
        suite("#getAcceptedFriends", function () {
          test("requester should have 0", check('Accepted', 1, 0, 1))
          test("requestee should have 0", check('Accepted', 0, 0, 1))
        })
        suite(".getRequestedFriends", function () {
          test("requester should have 1", check('Requested', 1, 1))
          test("requestee should have 0", check('Requested', 0, 0))
        })
        suite("#getRequestedFriends", function () {
          test("requester should have 1", check('Requested', 1, 1, 1))
          test("requestee should have 0", check('Requested', 0, 0, 1))
        })
      })

      suite("after reciprocation", function () {
        setup(function (done) {
          User.requestFriend(u2, u1, done);
        })
        suite(".getPendingFriends", function () {
          test("requester should have 0", check('Pending', 1, 0))
          test("requestee should have 0", check('Pending', 0, 0))
        })
        suite("#getPendingFriends", function () {
          test("requester should have 0", check('Pending', 1, 0, 1))
          test("requestee should have 0", check('Pending', 0, 0, 1))
        })
        suite(".getAcceptedFriends", function () {
          test("requester should have 1", check('Accepted', 1, 1))
          test("requestee should have 1", check('Accepted', 0, 1))
        })
        suite("#getAcceptedFriends", function () {
          test("requester should have 1", check('Accepted', 1, 1, 1))
          test("requestee should have 1", check('Accepted', 0, 1, 1))
        })
        suite(".getRequestedFriends", function () {
          test("requester should have 0", check('Requested', 1, 0))
          test("requestee should have 0", check('Requested', 0, 0))
        })
        suite("#getRequestedFriends", function () {
          test("requester should have 0", check('Requested', 1, 0, 1))
          test("requestee should have 0", check('Requested', 0, 0, 1))
        })
      })
    });

    suite("sorting & limiting", function () {
      var u3, u4;

      var reciprocate = function (a, b) {
        return function (done) {
          a.requestFriend(b, function () {
            b.requestFriend(a, done);
          })
        }
      }

      var request = function (a, b) {
        return function (done) {
          a.requestFriend(b, done);
        }
      }

      setup(function (done) {
        u3 = new User({name: "Zeke"})
        u4 = new User({name: "Beatrice"})
        u5 = new User({name: "Dan"})
        u6 = new User({name: "Norm"})
        User.create([u3, u4, u5, u6], function () {
          async.parallel([
            reciprocate(u1, u2),
            reciprocate(u1, u3),
            reciprocate(u1, u4),
            request(u1, u5),
            request(u1, u6),
            reciprocate(u5, u6),
            request(u5, u4)
          ], function () {
            User.getFriends(u1, function (err, friends) {
              // sanity
              friends.length.should.eql(5);
              done();
            });
          });
        });
      });

      test("status condition (Accepted)", function (done) {
        var conditions = {};
        conditions[pathname+".status"] = Status.Accepted;

        u1.getFriends(conditions, function (err, friends) {
          friends.length.should.eql(3);
          done();
        });
      });

      test("status condition (Requested)", function (done) {
        var conditions = {};
        conditions[pathname+".status"] = Status.Requested;

        u1.getFriends(conditions, function (err, friends) {
          friends.length.should.eql(2);
          done();
        });
      });

      test("select fields", function (done) {
        u1.getFriends({_id: u6._id}, {_id: 1}, function (err, friends) {
          should.not.exist(friends[0].friend.name);
          friends[0].friend._id.should.eql(u6._id);
          done();
        });
      });

      test("limiting", function (done) {
        User.getFriends(u1, {}, null, {limit: 2}, function (err, friends) {
          friends.length.should.eql(2);
          done();
        });
      });

      test("sorting", function (done) {
        var names = _.pluck([u2, u3, u4, u5, u6], "name").sort();
        User.getFriends(u1, {}, null, {sort: {name: 1}}, function (err, friends) {
          assert.deepEqual(names, _.map(friends, function (fship) {
            return fship.friend.name;
          }));
          done();
        });
      });
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

          var conditions = {};
          conditions[pathname+".status"] = status;

          if (isStatic) {
            User.getFriends(user, conditions, null, {sort: {name: 1}}, cb)
          } else {
            user.getFriends(conditions, cb);
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
      ensureUsers(function () {
        User.requestFriend(u1, u2, function () {
          User.requestFriend(u2, u1, done);
        })
      })
    })

    suite(".removeFriend", function () {
      setup(function (done) {
        User.removeFriend(u1, u2, done);
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
