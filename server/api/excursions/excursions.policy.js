const _ = require('lodash');
const Excursion = require('../../models/excursion');
const policy = require('../policy');
const trailsPolicy = require('../trails/trails.policy');
const usersPolicy = require('../users/users.policy');
const utils = require('../utils');

exports.canCreate = function(req) {
  return policy.authenticated(req);
};

exports.canList = function(req) {
  return policy.authenticated(req);
};

exports.canRetrieve = function(req) {
  return policy.authenticated(req);
};

exports.canUpdate = function(req) {
  return policy.authenticated(req);
};

exports.scope = function(req) {
  return new Excursion();
};

exports.serialize = function(excursion, req) {
  var result = {
    id: excursion.get('api_id'),
    trailId: excursion.related('trail').get('api_id'),
    creatorId: excursion.related('creator').get('api_id'),
    name: excursion.get('name'),
    themes: excursion.get('themes'),
    zones: excursion.get('zones'),
    plannedAt: excursion.get('planned_at'),
    createdAt: excursion.get('created_at'),
    updatedAt: excursion.get('updated_at')
  };

  if (utils.includes(req, 'creator')) {
    result.creator = usersPolicy.serialize(excursion.related('creator'), req);
  }

  if (utils.includes(req, 'trail')) {
    result.trail = trailsPolicy.serialize(excursion.related('trail'), req);
  }

  return result;
};
