const Receiver = require('./receiver')
const Telegram = require('./telegram')
const config = require('../config.json')

const AWS = require('aws-sdk');
const s3 = new AWS.S3({
    signatureVersion: 'v4'
})

var blacklist = []
s3.getObject(config.blacklistS3File, function (err, data) {
    console.log('blacklist data:', data)
    blacklist = JSON.parse(data.Body.toString())
});

var receiver = new Receiver(config)
var telegram = new Telegram(config)

function redirectTo(callback, url) {
    console.log('<redirectTo>', url)
    return new Promise((success, reject) => {
        callback(null, {
            statusCode: 302,
            headers: {
                Location: url,
            }
        })
    })
}

exports.ses = function (event, callback) {
    receiver.receive(event, blacklist)
        .then(telegram.deliver.bind(telegram))
        .then(callback)
}

exports.telegramButton = function (event, callback) {
    telegram.buttonPressed(event, blacklist)
        .then(callback)
}

exports.view = function (event, callback) {
    var messageId = event.queryStringParameters.messageId
    var gotEmail = receiver.getEmail(messageId)
    if (event.queryStringParameters.pos) {
        gotEmail.then((email) => {
            var pos = parseInt(event.queryStringParameters.pos)
            var filename = 'attachment/' + messageId + '/' + email.parsedBody.attachments[pos].fileName
            receiver.saveToS3(filename, email.parsedBody.attachments[pos].content)
                .then(redirectTo(callback, config.publicS3URL + filename))
        })
    } else {
        gotEmail.then((email) => {
            var filename = 'html/' + messageId + '.html'
            receiver.saveToS3(filename, email.parsedBody.html ? email.parsedBody.html : email.parsedBody.text)
                .then(redirectTo(callback, config.publicS3URL + filename))
        })
    }
}