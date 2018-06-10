const process = require('./process')

exports.ses = function (event, context, callback) {
    // console.log('EVENT', JSON.stringify(event))
    process.ses(event, function () {
        callback(null, { statusCode: 200, body: 'OK' })
    })
}

exports.telegram = function (event, context, callback) {
    // console.log('TELEGRAM EVENT', JSON.stringify(event))
    // console.log('params', JSON.stringify(JSON.parse(event.body)))
    process.telegramButton(JSON.parse(event.body), function () {
        callback(null, { statusCode: 200, body: 'OK' })
    })
}

exports.view = function (event, context, callback) {
    // console.log('view EVENT', JSON.stringify(event, null, 2))
    process.view(event, callback)
}