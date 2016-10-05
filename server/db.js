var _ = require('lodash'),
    bookshelf = require('bookshelf'),
    config = require('../config'),
    knex = require('knex');

var logger = config.logger('db');

// Initialize knex.
var db = knex({
  client: 'postgresql',
  connection: config.db
});

db.on('query', logDbQueries);

// Initialize and export bookshelf.
module.exports = bookshelf(db);
module.exports.plugin('registry');
module.exports.plugin('virtuals');

/**
 * Runs a database query to ensure the connection is working.
 *
 * @returns Promise A promise that will be resolved if the connection is working, or rejected otherwise.
 */
module.exports.ensureConnected = function() {
  return db.raw('select 1+1 as n').then(function(result) {
    if (result.rowCount !== 1 || result.rows[0].n !== 2) {
      throw new Error('Could not get expected result from the database');
    }
  });
};

module.exports.disconnect = function() {
  db.destroy();
};

function logDbQueries(query) {

  var message = query.sql;

  if (query.bindings) {
    _.each(query.bindings, function(binding) {
      // FIXME: only allow in development
      message = message.replace(/\?/, binding);
    });
  }

  if (!message.match(/;$/)) {
    message = message + ';';
  }

  logger.trace(message);
}
