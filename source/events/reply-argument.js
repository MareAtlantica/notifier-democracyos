var config = require('../../config');
var db = require('../db')(config.db);
var transport = require('../transport');
var logger = require('../utils/logger');
var templates = require('../templates');
var t = require('../translations').t;
var ObjectId = require('mongojs').ObjectId;

module.exports = function (notifier) {
  if (!notifier || typeof notifier != 'object') throw new Error('Unable to initialize singup event - Undefined notifier');

  // Receiver
  notifier
    .receive('reply-argument', function (event, actions, callback) {
      logger.info('Received event ' + JSON.stringify(event));

      actions.create('reply-argument', { reply: event.reply, comment: event.comment, url: event.url }, function (err) {
        logger.info({message: 'Created "send-welcome" action for user ' + event.user });
        callback && callback(err);
      });

    })

  // Resolver
    .resolve('reply-argument', function (action, actions, callback) {
      logger.info('Resolving action ' + JSON.stringify(action));
      var id = action.comment.author;

      if (action.reply.author.id == id) {
        return actions.skipped(action, callback);
      }

      db.user.findOne({ _id: ObjectId(action.comment.author) }, function (err, commentAuthor) {
        if (err) return callback(err);
        if (!commentAuthor) return callback({message: 'user not found', email: action.comment.author});

        if (commentAuthor.notifications && !commentAuthor.notifications.replies) {
          return actions.skipped(action, callback);
        }

        db.user.findOne({_id: ObjectId(id)}, function (err, author) {
          if (err) return callback(err);
          if (!author) return callback({message: 'user not found', email: action.comment.author});

          var data = {
            author: author,
            comment: action.comment,
            reply: action.reply,
            url: action.url
          }

          logger.info('Received action ' + JSON.stringify(action) + ' with data ' + JSON.stringify(data));
          actions.resolved(action, data, callback);
        });
      })
    })

    // Executor
    .execute('reply-argument', function (action, transport, callback) {
        var vars = [
          {name: 'USER_NAME', content: formatName(action.data.author)},
          {name: 'REPLY', content: action.reply.text},
          {name: 'URL', content: action.data.url}
        ];

        // Add get content from jade template
        templates.jade('reply-argument', vars, function (err, content) {

          transport.mandrill('/messages/send', {
              message: {
                auto_html: null,
                to: [{email: action.data.author.email}],
                preserve_recipients: false,
                from_email: config.transport.mandrill.from.email,
                from_name: config.transport.mandrill.from.name,
                subject: t('templates.reply-argument.subject'),
                text: content,
                html: content,
                auto_text: true
              }
            }, function (err) {
              callback && callback(err);
            });
        });
    });
}



function formatName (user) {
  return user.lastName ? user.firstName + ' ' + user.lastName : user.firstName
}