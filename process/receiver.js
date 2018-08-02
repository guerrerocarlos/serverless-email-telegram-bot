const Email = require('./email')
const AWS = require('aws-sdk');
const s3 = new AWS.S3({
    signatureVersion: 'v4'
})
const chalk = require('chalk')

class Receiver {
    constructor(config) {
        this.config = config
    }

    receive(event, blacklist) {
        return new Promise((resolve, reject) => {
            var email = new Email(this.config, s3)
            email.setEvent(event)
            email.getBody().then(() => {
                // console.log(chalk.green('email.parsedBody'), JSON.stringify(email.parsedBody))
                // console.log(chalk.green('email.parsedBody.text'), email.parsedBody.text)
                try {
                    if (blacklist.indexOf(email.parsedBody.from[0].address.toLowerCase()) > -1 ||
                        blacklist.indexOf(email.parsedBody.from[0].address.toLowerCase().split('@')[1]) > -1 ||
                        email.parsedBody.replyTo && blacklist.indexOf(email.parsedBody.replyTo[0].address.toLowerCase()) > -1 ||
                        email.parsedBody.replyTo && blacklist.indexOf(email.parsedBody.replyTo[0].address.toLowerCase().split('@')[1]) > -1
                    ) {
                        console.log('reject!')
                        reject()
                    } else {
                        console.log('resolve!')
                        resolve(email)
                    }
                } catch (err) {
                    reject(err)
                }
            })
        })
    }

    getEmail(messageId) {
        return new Promise((resolve, reject) => {
            var email = new Email(this.config, s3)
            email.getBody(messageId).then(() => {
                resolve(email)
            })
        })
    }

    saveToS3(filename, content) {
        var self = this
        return new Promise((resolve, reject) => {
            var params = {
                Body: content,
                Bucket: self.config.emailBucket,
                Key: filename,
                ACL: "public-read"
            };
            s3.putObject(params, function (err, data) {
                console.log('PUT', err, data)
                if (err) console.log(err, err.stack);
                else resolve(data);
            });
        })
    }

}

module.exports = Receiver