/**
 * Status of a friendship
 */
module.exports = {
  // This friend has received a friend request, but not yet accepted.
  Pending: 'pending',

  // This friendship is active. Both parties will have this status once
  // the receiving friend has accepted.
  Accepted: 'accepted',

  // This is a friend request made by the player that has not yet been
  // accepted.
  Requested: 'requested'
}
