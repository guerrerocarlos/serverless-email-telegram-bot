var TelegramBot = require('node-telegram-bot-api');
const prettyBytes = require('pretty-bytes');
const AWS = require('aws-sdk');
const s3 = new AWS.S3({
    signatureVersion: 'v4'
})

function saveBlacklist(params, blacklist){

    params.Body = JSON.stringify(Array.from(new Set(blacklist)))

    console.log((JSON.stringify(params, null, 2)))
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
            console.log('hooked:', a, b, c)
        })
    }

    deliver(email) {
        var self = this
        var inline_keyboard = [
            [{
                text: '🔍 Open',
                url: this.config.viewUrl + '?messageId=' + email.email.messageId,
            }, {
                text: '◾️ Blacklist',
                callback_data: 'blacklist__' + email.email.source// + '__'+email.email.messageId,
            }]
        ]
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
        console.log('inline_keyboard', JSON.stringify(inline_keyboard, null, 2))
        this.bot.sendMessage(this.config.userId, email.telegramFormat(), {
            reply_markup: {
                inline_keyboard: inline_keyboard
            },
            parse_mode: "HTML",
            disable_web_page_preview: true
        }).then((result) => {
            console.log('result', result)
        })
    }

    buttonPressed(event, blacklist) {
        console.log('[buttonPressed]', JSON.stringify(event, null, 2))
        var self = this
        return new Promise((resolve, reject) => {
            if (event.callback_query) {
                var email = event.callback_query.data.split('__')[1]
                switch (event.callback_query.data.split('__')[0]) {
                    case 'blacklist':
                        var inline_keyboard = [
                            [{
                                text: '🏳 Whitelist '+email,
                                callback_data: 'whitelist__' + email,
                            }]
                        ]
                        blacklist.push(email)
                        saveBlacklist(this.config.blacklistS3File, blacklist)
                        console.log('event:', JSON.stringify(event, null, 2))
                        var params = {
                            chat_id: event.callback_query.message.chat.id,
                            message_id: event.callback_query.message.message_id,
                            reply_markup: { inline_keyboard: inline_keyboard }
                        }
                        console.log('params', params)
                        this.bot.editMessageText('❌ ' + email + ' Blacklisted', params).then(resolve)
                        break;
                    case 'whitelist':
                        var inline_keyboard = [
                            [{
                                text: '❌ Blacklist '+ email,
                                callback_data: 'blacklist__' + email,
                            }]
                        ]
                        var params = {
                            chat_id: event.callback_query.message.chat.id,
                            message_id: event.callback_query.message.message_id,
                            reply_markup: { inline_keyboard: inline_keyboard }
                        }
                        saveBlacklist(this.config.blacklistS3File, blacklist)

                        console.log('params', params)
                        this.bot.editMessageText('✅ ' + email + ' Whitelisted', params).then(resolve)
                        break;
                }
            }


            if (event.message && event.message.reply_to_message) {
                var text = event.message.reply_to_message.text

                var params = {}
                params.subject = text.split('\n')[1]
                params.to = text.split('[')[1].split(']')[0]
                params.from = text.split('[').pop()
                params.from = params.from.split(']')[0]

                params.text = event.message.text

                var sg = new require('@sendgrid/mail')
                sg.setApiKey(self.config.sendgridKey)
                sg.send(params)
            }
        })
    }

}

module.exports = Telegram