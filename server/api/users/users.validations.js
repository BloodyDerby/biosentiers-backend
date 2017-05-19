const _ = require('lodash');
const User = require('../../models/user');

exports.emailAvailable = function(existingUser) {
  return function(context) {

    const email = context.get('value');
    if (!_.isString(email) || _.isEmpty(email.trim())) {
      return;
    }

    let query = new User().whereEmail(email);

    if (existingUser) {
      query = query.query(function(queryBuilder) {
        queryBuilder.whereNot('id', existingUser.get('id'));
      });
    }

    return query.fetch().then(function(user) {
      if (user) {
        context.addError({
          validator: 'user.emailAvailable',
          message: 'is already taken'
        });
      }
    });
  };
};
