var TelegramBot = require('node-telegram-bot-api');
const prettyBytes = require('pretty-bytes');
const AWS = require('aws-sdk');
const s3 = new AWS.S3({
    signatureVersion: 'v4'
})
const chalk = require('chalk')
const Email = require('./email')

function saveBlacklist(params, blacklist) {

    params.Body = JSON.stringify(Array.from(new Set(blacklist)))

    s3.putObject(params, function (err, data) {
        console.log('PUT', err, data)
    });
}

class Telegram {
    constructor(config) {
        this.config = config
        this.bot = new TelegramBot(this.config.telegram, {
            polling: false,
            cancellation: true
        });
        this.bot.setWebHook(this.config.telegramHook).then(function (a, b, c) {
            // console.log('hooked:', a, b, c)
        })
    }

    deliver(email) {
        console.log(chalk.yellow('deliver...'))

        var self = this
        var inline_keyboard = [
            [{
                text: '🔍 Open',
                url: this.config.viewUrl + '?messageId=' + email.email.messageId,
            },
            {
                text: '📮 Show',
                callback_data: 'ss__' + email.email.messageId,
            },
            {
                text: '⚙️ More',
                callback_data: 'mr__' + email.email.messageId,
            }]
        ]

        console.log(chalk.yellow('FROM:'), email.parsedBody.from)
        // console.log(chalk.blue('parsed:'), email.parsedBody)
        var formatedEmail = email.telegramFormat()

        // var blacklistEmails = formatedEmail.blacklistEmails

        console.log('blacklistEmails')

        // blacklistEmails.forEach((sourceEmail) => {
        //     inline_keyboard.push([{
        //         text: '◾️' + sourceEmail,
        //         callback_data: 'blacklist__' + sourceEmail// + '__'+email.email.messageId, guerrerocarlos@gmail.com
        //     }])
        // })
        // inline_keyboard[0].push({
        //     text: '❌ Delete',
        //     callback_data: 'blacklist__' + sourceEmail.split('@')[1] // + '__'+email.email.messageId,
        // })

        email.getAttachments().forEach((eachAttachment, pos) => {
            if (eachAttachment.length > (1024 * 1024 * 50)) {
                inline_keyboard.push([{
                    text: '📁 ' + eachAttachment.fileName + ' (' + prettyBytes(eachAttachment.length) + ')',
                    url: this.config.viewUrl + '?messageId=' + email.email.messageId + '&pos=' + pos,
                }])
            } else {
                var type = 'Document'
                if (eachAttachment.contentType.indexOf('image') > -1) {
                    type = 'Photo'
                }
                if (eachAttachment.contentType.indexOf('audio') > -1) {
                    type = 'Audio'
                }
                if (eachAttachment.contentType.indexOf('video') > -1) {
                    type = 'Audio'
                }
                self.bot['send' + type](this.config.userId, eachAttachment.content, {}, { filename: eachAttachment.fileName, contentType: eachAttachment.contentType });
            }
        })


        this.bot.sendMessage(this.config.userId, formatedEmail.text, {
            reply_markup: {
                inline_keyboard: inline_keyboard
            },
            parse_mode: "HTML",
            disable_web_page_preview: true
        }).then((result) => {
            // const fileOptions = {
            //     filename: email.email.messageId + '.html',
            //     contentType: 'text/html',
            // };
            // self.bot['sendDocument'](this.config.userId, Buffer.from(formatedEmail.html), {}, fileOptions);

            // const fileOptions2 = {
            //     filename: email.email.messageId + 'plain.html',
            //     contentType: 'text/html',
            // };
            // self.bot['sendDocument'](this.config.userId, Buffer.from(formatedEmail.plain), {}, fileOptions2);
        })
    }

    buttonPressed(event, blacklist, cb) {
        var self = this
        console.log(chalk.red('blacklist'), blacklist)
        return new Promise((resolve, reject) => {
            if (event.callback_query) {
                var emailhash = event.callback_query.data.split('__')[1]
                switch (event.callback_query.data.split('__')[0]) {
                    case 'mr':
                        var inline_keyboard = [
                            [{
                                text: '🔍 Open',
                                url: this.config.viewUrl + '?messageId=' + emailhash,
                            }, {
                                text: '📮 Show',
                                callback_data: 'ss__' + emailhash,
                            }]]

                        var email = new Email(this.config, s3)
                        email.getBody(emailhash).then(() => {
                            var formatedEmail = email.telegramFormat(true)
                            var blacklistEmails = formatedEmail.blacklistEmails
                            blacklistEmails.forEach((sourceEmail) => {
                                inline_keyboard.push([{
                                    text: '◾️' + sourceEmail,
                                    callback_data: 'blacklist__' + sourceEmail// + '__'+email.email.messageId, guerrerocarlos@gmail.com
                                }])
                            })

                            var params = {
                                chat_id: event.callback_query.message.chat.id,
                                message_id: event.callback_query.message.message_id,
                            }

                            this.bot.editMessageReplyMarkup({ inline_keyboard: inline_keyboard }, params).then(resolve)
                        })

                        break;
                    case 'ss':
                        var inline_keyboard = [
                            [{
                                text: '🔍 Open',
                                url: this.config.viewUrl + '?messageId=' + emailhash,
                            }]]


                        var email = new Email(this.config, s3)
                        email.getBody(emailhash).then(() => {
                            var formatedEmail = email.telegramFormat(true)

                            var params = {
                                chat_id: event.callback_query.message.chat.id,
                                message_id: event.callback_query.message.message_id,
                                reply_markup: { inline_keyboard: inline_keyboard },
                                parse_mode: "HTML",
                            }

                            this.bot.editMessageText(formatedEmail.text, params).then(resolve)
                        })

                        break;
                    case 'blacklist':
                        var inline_keyboard = [
                            [{
                                text: '🏳 Whitelist ' + email,
                                callback_data: 'whitelist__' + email,
                            }]
                        ]
                        blacklist.push(email.toLowerCase())

                        saveBlacklist(this.config.blacklistS3File, blacklist)
                        var params = {
                            chat_id: event.callback_query.message.chat.id,
                            message_id: event.callback_query.message.message_id,
                            reply_markup: { inline_keyboard: inline_keyboard }
                        }

                        this.bot.editMessageText('❌ ' + email + ' Blacklisted', params).then(resolve)
                        break;
                    case 'whitelist':
                        var inline_keyboard = [
                            [{
                                text: '❌ Blacklist ' + email,
                                callback_data: 'blacklist__' + email,
                            }]
                        ]

                        var index = blacklist.indexOf(email);
                        if (index > -1) {
                            blacklist.splice(index, 1);
                        }
                        saveBlacklist(this.config.blacklistS3File, blacklist)

                        var params = {
                            chat_id: event.callback_query.message.chat.id,
                            message_id: event.callback_query.message.message_id,
                            reply_markup: { inline_keyboard: inline_keyboard }
                        }

                        this.bot.editMessageText('✅ ' + email + ' Whitelisted', params).then(resolve)
                        break;
                }
                if (cb) cb()
            }


            if (event.message && event.message.reply_to_message) {
                var text = event.message.reply_to_message.text

                console.log('event.message.reply_to_message', event.message.reply_to_message)

                var messageId = text.split('🆔 ')[1].split('.')[0]
                console.log('messageId', messageId)
                var email = new Email(this.config, s3)
                email.getBody(messageId).then(() => {
                    var params = {}
                    // console.log(chalk.blue('parsedBody'), email.parsedBody)
                    params.to = email.parsedBody.from[0].address
                    params.subject = email.parsedBody.subject
                    params.from = email.parsedBody.to[0].address
                    params.text = event.message.text
                    params.headers = {}
                    if (email.parsedBody.messageId) {
                        params.headers['In-Reply-To'] = email.parsedBody.messageId
                    }
                    // if(email.parsedBody.references){
                    // params.headers['references'] = email.parsedBody.references
                    // }

                    console.log(params)

                    var sg = new require('@sendgrid/mail')
                    sg.setApiKey(self.config.sendgridKey)
                    sg.send(params).then(() => {
                        if (cb) cb()
                    })

                })


            } else {
                if (cb) cb()
            }
        })
    }

}

module.exports = Telegram