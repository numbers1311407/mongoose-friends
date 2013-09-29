var mongoose = require("mongoose")
  , _ = require("underscore")
  , async = require("async")
  , Status = require("./status")


/**
 * The schema for an embedded friendship
 */
var Friendship = new mongoose.Schema({
  status: {type: String, enum: _.values(Status)}
})


/**
 * Fields to add to the extending model
 */
var fields = {
  _friends: {type: [Friendship], select: false}
}


/**
 * The work function which pushes or updates embedded friend objects
 * for two documents, returns a function
 *
 * @api private
 */
var _update = function (query, update, fship, Model) {
  var options = { new: false };

  return function (done) {
    Model.findOneAndUpdate(query, update, options, function (err, res) {
      done(err, fship);
    });
  }
}


/**
 * Return a function to update a friendship between two parties
 *
 * @api private
 */
var update = function (Model, m1, m2, fship, done) {
  return _update({
    _id: m1._id,
    _friends: {$elemMatch: {_id: m2._id}}
  }, {
    $set: {
      "_friends.$.status": fship.status
    }
  }, fship, Model, done);
}


/**
 * Return a function to create a new friendship between two parties
 *
 * @api private
 */
var push = function (Model, m1, m2, fship, done) {
  return _update({
    _id: m1._id
  }, {
    $push: { _friends: fship }
  }, fship, Model, done);
}


/**
 * Generate a function to return one side of a friendship between
 * two models
 *
 * @param Model the extending model
 * @param m1 the model being queried
 * @param m2 the model whose friendship is queried for
 * 
 * @returns a function which will call back with an friendship for m2 on m1
 */
var friendshipBetween = function (Model, m1, m2) {
  return function (done) {
    Model.findById(m1, {
      _friends: {$elemMatch: {_id: m2._id}}
    }, function (err, doc) {
      if (err) return done(err);
      done(null,doc._friends[0]);
    });
  }
}


module.exports = function () {

  return function friends (schema) {

    // add the embedded friends
    schema.add(fields);

    /**
     * Send friend request from "friender" to "friend".  Calls back with
     * an object containing the two resulting friend objects.
     *
     * Reciprocating the request accepts it.
     */
    schema.statics.requestFriend = function (m1, m2, cb) {
      var Model = this
        , steps = {};

      async.auto({
        m1: friendshipBetween(Model, m1, m2),
        m2: friendshipBetween(Model, m2, m1)
      }, function (err, o) {
        if (err) return cb(err);

        var hasfship = !!o.m1;
        var fship = o.m1 || {_id: m2._id};

        // m2 has no friendship, add a new pending friendship, mark
        // m1's status as requested
        if (!o.m2) {
          fship.status = Status.Requested;
          steps.friend = push(Model, m2, m1, {_id: m1._id, status: Status.Pending});
        } else {
          switch (o.m2.status) {

          // m2 status is still pending, no update
          case Status.Pending:
            fship.status = Status.Requested;
            break;

          // m2 status is accepted already, no update
          case Status.Accepted:
            fship.status = Status.Accepted;
            break;

          // m2 already requested m1, mark BOTH friendships as accepted
          case Status.Requested:
            fship.status = Status.Accepted;
            steps.friend = update(Model, m2, m1, {_id: m1._id, status: Status.Accepted});
            break;
          }
        }

        steps.friend || (steps.friend = function (done) {
          // If no update was necessary, send the friendship back directly
          done(null, fship);
        });

        // Currently the friender is always updated, although this might
        // not be necessary either.
        // TODO: don't update or push the friender-ship if it exists and is unchanged
        steps.friender = (hasfship)
          ? update(Model, m1, m2, fship, cb)
          : push(Model, m1, m2, fship, cb);

        async.parallel(steps, cb);
      });
    };

    /**
     * Create a friend request
     *
     * @param {Model} friend The potential friend being requested
     * @param {Function} cb Callback once friendship is created
     */
    schema.methods.requestFriend = function (friend, cb) {
      return this.constructor.requestFriend(this, friend, cb);
    };


    /**
     * Get all friends of a model
     *
     * Options
     * ---
     * - {Boolean} pending Include pending friend requests (default false)
     *
     * @param {Object} options 
     */
    schema.statics.getFriends = function (model, options, cb) {
      var Model = this
        , op = 'find'

      if ('function' === typeof options) {
        cb = options;
        options = {};
      }

      // if model is NOT a mongoose model, assume it's an _id of a model
      if (!model._id) {
        model = new this({_id: model});
      }

      var query = {
        "_friends._id": model._id,
      }

      // "accepted" status is mirrored on both sides, but if querying
      // for "pending" or "requested" friends, the query must be reversed
      if (options.status && _.contains(Status, options.status)) {
        query["_friends.status"] = (options.status === Status.Accepted)
          ? Status.Accepted
          : (options.status === Status.Pending)
          ? Status.Requested
          : Status.Pending
      }

      // if an id is passed, find one friendship
      if (options.id) {
        query._id = options.id;
        op = 'findOne';
      }

      async.parallel({
        friends: function (done) {
          Model[op](query, options.select, {lean: true}, done);
        },

        statuses: function (done) {
          Model.findOne({_id: model._id}, {_friends: 1}, function (err, doc) {
            if (err) return done(err);
            if (!doc) return done(null, []);

            done(null, _.reduce(doc._friends, function (o, friend) {
              o[friend._id] = friend.status;
              return o;
            }, {}));
          });
        }
      }, function (err, res) {
        if (err) return cb(err);
        if (options.id) res.friends = [res.friends];

        // wrap the results with the status
        for (var i=0; i<res.friends.length; i++) {
          res.friends[i] = {
            status: res.statuses[res.friends[i]._id],
            friend: res.friends[i]
          }
        }

        cb(null, options.id ? res.friends[0] : res.friends);
      });
    };


    schema.methods.getFriends = function (options, cb) {
      if ('function' === typeof options) {
        cb = options;
        options = {};
      }
      return this.constructor.getFriends(this, options, cb);
    };


    schema.statics.getPendingFriends = function (model, cb) {
      return this.getFriends(model, {pending: true}, cb);
    };


    schema.methods.getPendingFriends = function (cb) {
      return this.constructor.getPendingFriends(this);
    };


    schema.statics.removeFriendship = function (m1, m2, cb) {
      var collection = this.collection
      var pull = function (m1, m2) {
        return function (done) {
          collection.update({_id: m1._id}, {
            $pull: {_friends: {_id: m2._id}}
          }, done);
        }
      }
      async.parallel([pull(m1, m2), pull(m2, m1)], cb);
    };

    schema.methods.removeFriend = function (model, cb) {
      return this.constructor.removeFriendship(this, model, cb);
    };
  };
};


module.exports.Status = Status;
