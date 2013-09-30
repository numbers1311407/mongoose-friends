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
 * Default option values
 */
var optionDefaults = {

  /**
   * The name of the document array "friends" path (default: "_friends")
   */
  pathName: "_friends",

  /**
   * Should an index be added ot the friends doc array? (default: true)
   */
  index: true
};

/**
 * expose the plugin function as exports
 *
 * Options
 * ---
 * - {String} pathName the pathname for the friends document array (default "_friends")
 *
 * @param {Object} options
 */
module.exports = plugin;

/**
 * expose Status as a property of the plugin
 */
module.exports.Status = Status;


function plugin (options) {
  options = _.defaults(options || {}, optionDefaults);

  // the pathName for the friends array
  var pathName = options.pathName;

  // Fields to add to the extending model
  var fields = {};
  fields[pathName] = { type: [Friendship], select: false };

  /**
   * The work function which pushes or updates embedded friend objects
   * for two documents, returns a function
   *
   * @api private
   */
  var _update = function (query, update, fship) {
    var options = { new: false };

    return function (done) {
      this.findOneAndUpdate(query, update, options, function (err, res) {
        done(err, fship);
      });
    }
  }

  /**
   * Return a function to update a friendship between two parties
   *
   * @api private
   */
  var updateFriendship = function (m1, m2, fship) {
    var query = {_id: m1};
    query[pathName] = {$elemMatch: {_id: m2}};

    var updater = {$set: {}};
    updater.$set[pathName+".$.status"] = fship.status;

    return _update(query, updater, fship);
  }


  /**
   * Return a function to create a new friendship between two parties
   *
   * @api private
   */
  var pushFriendship = function (m1, m2, fship) {
    var query = {_id: m1};

    var updater = {$push: {}};
    updater.$push[pathName] = fship;

    return _update(query, updater, fship);
  }


  /**
   * Generate a function to return one side of a friendship between
   * two models
   *
   * @param Model the extending model
   * @param m1 the model or model _id being queried
   * @param m2 the model or model _id whose friendship is queried for
   * 
   * @returns a function which will call back with an friendship for m2 on m1
   * @api private
   */
  var friendshipBetween = function (m1, m2) {
    var proj = {};
    proj[pathName] = {$elemMatch: {_id: m2}};

    return function (done) {
      this.findById(m1, proj, function (err, doc) {
        if (err) return done(err);
        done(null, doc[pathName][0]);
      });
    }
  }

  return function friends (schema) {
    // add the embedded friends
    schema.add(fields);

    // index the 
    if (options.index) {
      var index = {};
      index[pathName+"._id"] = 1;
      schema.index(index, {name: "friendsplugin"});
    }

    /**
     * Send friend request from "friender" to "friend".  Calls back with
     * an object containing the two resulting friend objects
     *
     * On first request, will result in a "requested" friendship for the
     * first party and a "pending" friendship for the second.
     *
     * Reciprocating the request (friendee back to friender) will accept it.
     *
     * @param {Model} m1 the "friender" model doc or _id doing the reqesting
     * @param {Model} m2 the "friendee" model doc or _id being requested
     * @param {Function} cb callback to execute on completion or error
     */
    schema.statics.requestFriend = function (m1, m2, cb) {
      var steps = {}
        , Model = this

      m1 = m1._id || m1;
      m2 = m2._id || m2;

      async.auto({
        m1: friendshipBetween(m1, m2).bind(this),
        m2: friendshipBetween(m2, m1).bind(this)
      }, function (err, o) {
        if (err) return cb(err);

        var hasfship = !!o.m1
          , fship = o.m1 || {_id: m2}
          , oid = fship._id
          , ostatus = fship.status

        // m2 has no friendship, add a new pending friendship, mark
        // m1's status as requested
        if (!o.m2) {
          fship.status = Status.Requested;
          steps.friend = pushFriendship(m2, m1, {
            _id: m1, 
            status: Status.Pending
          }).bind(Model);
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
            steps.friend = updateFriendship(m2, m1, {
              status: Status.Accepted
            }).bind(Model);
            break;
          }
        }

        steps.friend || (steps.friend = function (done) {
          // If no update was necessary, send the friendship back directly
          done(null, o.m2)
        });

        if (hasfship && ostatus == fship.status && oid.equals(fship._id)) {
          steps.friender = function (done) { 
            done(null, fship) 
          }
        } else if (hasfship) {
          steps.friender = updateFriendship(m1, m2, fship, cb).bind(Model)
        } else {
          steps.friender = pushFriendship(m1, m2, fship, cb).bind(Model)
        }

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
     * - {String} status optional status to filter by, one of pending|accepted|requested
     * - {String|Object} select the field select to pass along to mongoose
     *
     * @param {Model} model a model doc or _id of a model doc to find friends for
     * @param {Object} options 
     * @param {Function} cb callback to execute on completion or error
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

      var query = {};
      query[pathName+"._id"] = model._id;

      // "accepted" status is mirrored on both sides, but if querying
      // for "pending" or "requested" friends, the query must be reversed
      if (options.status && _.contains(Status, options.status)) {
        query[pathName+".status"] = (options.status === Status.Accepted)
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

      var select = {};
      select[pathName] = 1;

      async.parallel({
        friends: function (done) {
          Model[op](query, options.select, {lean: true}, done);
        },

        statuses: function (done) {
          Model.findOne({_id: model._id}, select, function (err, doc) {
            if (err) return done(err);
            if (!doc) return done(null, []);

            done(null, _.reduce(doc[pathName], function (o, friend) {
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


    /**
     * Get all friends of this model
     *
     * Options
     * ---
     * - {String} status optional status to filter by, one of pending|accepted|requested
     * - {String|Object} select the field select to pass along to mongoose
     *
     * @param {Object} options 
     * @param {Function} cb callback to execute on completion or error
     */
    schema.methods.getFriends = function (options, cb) {
      if ('function' === typeof options) {
        cb = options;
        options = {};
      }
      return this.constructor.getFriends(this, options, cb);
    };


    /**
     * Remove a friendship between two friends
     *
     * @param {Model} m1 the first model doc
     * @param {Model} m2 the second model doc
     * @param {Function} cb callback to execute on completion or error
     */
    schema.statics.removeFriend = function (m1, m2, cb) {
      var collection = this.collection

      m1 = m1._id || m1;
      m2 = m2._id || m2;

      var pull = function (m1, m2) {
        var update = {$pull: {}}
        update.$pull[pathName] = {_id: m2};
        return function (done) {
          collection.update({_id: m1}, update, done);
        }
      }

      async.parallel([pull(m1, m2), pull(m2, m1)], cb);
    };


    /**
     * Remove a friend of this model
     *
     * @param {Model} friend doc to remove
     * @param {Function} cb callback to execute on completion or error
     */
    schema.methods.removeFriend = function (model, cb) {
      return this.constructor.removeFriend(this, model, cb);
    };
  };
}
