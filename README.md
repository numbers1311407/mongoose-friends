mongoose-friends [![Build Status](https://travis-ci.org/numbers1311407/mongoose-friends.png)](http://travis-ci.org/numbers1311407/mongoose-friends)
===

2-way friendship relationship plugin for Mongoose ODM


Description and usage
===

Easily add "friendships" to your Mongoose user Model through a simple
plugin.  The friendships are stored in a sub-document array on the model
doc without the need for a separate collection.

Just include the plugin in the schema definition:

    var friends = require("mongoose-friends")
    var schema = new mongoose.Schema({ ... })

    // optionally specify a name for the path (default is "_friends")
    schema.plugin(friends({pathName: "_myCustomPath"}));

    var User = mongoose.model("User", schema);


Initiate a friend request via the `requestFriend` method:

    User.requestFriend(user1._id, user2._id, callback);

The two users now share a friendship, with different statuses: "requested"
and "pending", respectively.

    User.getFriends(user1, function (err, friendships) {
      // friendships looks like:
      // {status: "requested", friend: user2}
    });

    User.getFriends(user2, function (err, friendships) {
      // friendships looks like:
      // {status: "pending", friend: user1}
    });

To accept, just reciprocate the request:

    User.requestFriend(user1._id, user2._id, callback);

The two users are now friends:

    User.getFriends(user1, function (err, friendships) {
      // friendships looks like:
      // {status: "accepted", friend: user2}
    });

    User.getFriends(user2, function (err, friendships) {
      // friendships looks like:
      // {status: "accepted", friend: user1}
    });

To remove a friendship at any point in the process, just:

    User.removeFriend(user1, user2, callback);

`getFriends` takes a few options, notably:

- `status`: filter for only a particular status, e.g:

    var Status = friends.Status;
    User.getFriends(user1, {status: Status.pending}, cb);

- `select`: tailor the selected fields for returned friends

    User.getFriends(user1, {select: {name: 1}}, function (err, fships) {
      fships[0].friend; //=> {_id: "someid", name: "joebob"}
    })


All the static methods have instance variants:

    user.getFriends(options, cb);
    user.requestFriend(otheruser, cb);
    user.removeFriend(badfriend, cb);


Indexing
===

By default, the plugin will add a multikey index on the friends array.
If you do not want this behavior for whatever reason, just pass 
`index: false` to the plugin options, like:

    schema.plugin(friends({index: false}));


Installation 
===

    npm install mongoose-friends
