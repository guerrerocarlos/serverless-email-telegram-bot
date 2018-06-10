const chalk = require('chalk')
var quotedPrintable = require('quoted-printable');
var utf8 = require('utf8');
var MailParser = require("mailparser-mit").MailParser;

class Email {
    constructor(config, s3) {
        this.s3 = s3
        this.config = config
    }

    setEvent(event) {
        if (!event ||
            !event.hasOwnProperty('Records') ||
            event.Records.length !== 1 ||
            !event.Records[0].hasOwnProperty('eventSource') ||
            event.Records[0].eventSource !== 'aws:ses' ||
            event.Records[0].eventVersion !== '1.0') {
            console.log({
                message: "parseEvent() received invalid SES message:",
                level: "error",
                event: JSON.stringify(event)
            });
        } else {
            this.email = event.Records[0].ses.mail
            this.metadata = {}
            this.recipients = event.Records[0].ses.receipt.recipients
            event.Records[0].ses.mail.headers.forEach((header) => {
                if (header.name === 'Content-Type' && header.value.indexOf('multipart') > -1) {
                    this.multipart = header.value.split('boundary=')[1]
                }
                this.metadata[header.name] = header.value
            })
            if (this.multipart) {
                this.multipart = this.multipart.replace(/\"/g, '')
            }
            console.log(chalk.green('this.multipart:', this.multipart))
        }
    }

    getBody(messageId) {
        var self = this
        return new Promise((resolve, reject) => {
            self.s3.copyObject({
                Bucket: self.config.emailBucket,
                CopySource: self.config.emailBucket + '/' + self.config.emailKeyPrefix +
                    (messageId ? messageId : self.email.messageId),
                Key: self.config.emailKeyPrefix + (messageId ? messageId : self.email.messageId),
                ACL: 'private',
                ContentType: 'text/plain',
                StorageClass: 'STANDARD'
            }, function (err) {
                if (err) {
                    console.log({
                        level: "error",
                        message: "copyObject() returned error:",
                        error: err,
                        stack: err.stack
                    });
                    reject(
                        new Error("Error: Could not make readable copy of email."));
                }

                self.s3.getObject({
                    Bucket: self.config.emailBucket,
                    Key: self.config.emailKeyPrefix + (messageId ? messageId : self.email.messageId)
                }, function (err, result) {
                    if (err) {
                        console.log({
                            level: "error",
                            message: "getObject() returned error:",
                            error: err,
                            stack: err.stack
                        });
                        return reject(
                            new Error("Error: Failed to load message body from S3."));
                    }
                    self.body = result.Body.toString();
                    var mailparser = new MailParser();

                    mailparser.on("end", function (mail) {
                        self.parsedBody = mail;
                        resolve()
                    });

                    mailparser.write(self.body);
                    mailparser.end();
                })

            });
        });
    }

    getAttachments() {
        return this.parsedBody.attachments ? this.parsedBody.attachments : []
    }

    telegramFormat() {
        var formatted = ''
        if (this.multipart) {
            formatted = this.body.split(this.multipart)
            formatted = formatted[2].split('\r\n\r\n')
            formatted.shift()
        } else {
            formatted = this.body.split('\r\n\r\n')
            formatted.shift()

        }
        var body = formatted.join('\r\n\r\n')
        var content = (((body.length < this.config.maxTelegramSize ? body : (body.slice(0, 4000)) + ' <i>[Incomplete]</i>')))

        body = body.replace(new RegExp('<', 'g'), '[').replace(new RegExp('>', 'g'), ']')


        var result = '✉️ <b>' + this.metadata.From.replace(new RegExp('<', 'g'), '\[').replace(new RegExp('>', 'g'), '\]') + '</b> \r\n' +
            '<i>' + this.metadata.Subject + '</i>\r\n\r\n' +
            content +
            '\r\n📬<b>' + this.metadata.To.replace(new RegExp('<', 'g'), '\[').replace(new RegExp('>', 'g'), '\]') + '</b>\r\n'
        return result
    }
}

module.exports = Email