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
            this.receipt = event.Records[0].ses.receipt
            event.Records[0].ses.mail.headers.forEach((header) => {
                if (header.name === 'Content-Type' && header.value.indexOf('multipart') > -1) {
                    this.multipart = header.value.split('boundary=')[1]
                }
                this.metadata[header.name] = header.value
            })
            // if (this.multipart) {
            //     this.multipart = this.multipart.replace(/\"/g, '')
            // }
            // console.log(chalk.green('this.multipart:', this.multipart))
        }
    }

    getBody(messageId) {
        var self = this
        return new Promise((resolve, reject) => {
            messageId = (messageId ? messageId : self.email.messageId)
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

                    mailparser.on("end", function (email) {
                        self.parsedBody = email;
                        self.messageId = messageId;
                        console.log('TO', self.parsedBody.to)
                        console.log('FROM', self.parsedBody.from)
                        self.to = self.parsedBody.to//[0].address
                        self.subject = self.parsedBody.subject
                        self.from = self.parsedBody.from//[0].address
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

    telegramFormat(full) {
        var formatted = ''

        var body = this.parsedBody.text
        var html = this.parsedBody.html
        if (body === undefined) {

            const cheerio = require('cheerio');
            // var strip = require('strip')
            // var strip2 = require('remove-html-comments')

            const $ = cheerio.load(this.parsedBody.html);
            $('head').remove()

            // console.log(chalk.cyan('body'), this.parsedBody)
            // body = strip(strip2($.html()).data)
            // body = strip($.html())
            body = $.text()
            body = body.split(/\n+\t*\s*/g).join('\r\n')
            console.log(chalk.cyan('body'), body)
            // body = body.replace(/[\n\r]+/, "\n")
            // body = body.replace(/[\s]+/, " ")
            // console.log(chalk.yellow('body'), $.text())
        }
        // var bodyPieces = body.html.split('\n')
        // body = bodyPieces.slice(0, 10).join('\n')
        // var body = this.parsedBody.html
        console.log(chalk.red('body'), body)
        // console.log(chalk.cyan(body))

        try {
            var content = (((body.length < this.config.maxTelegramSize ? body : (body.slice(0, 3850)) + ' [Incomplete]')))

            content = content.replace(new RegExp('<', 'g'), '\[').replace(new RegExp('>', 'g'), '\]')

            console.log(chalk.yellow(body))

            var flagged = []
            var typesOfFlags = ['spamVerdict', 'virusVerdict', 'spfVerdict', 'dkimVerdict', 'dmarcVerdict']
            var badFlagsCount = 0
            typesOfFlags.forEach((flagName) => {
                if (this.receipt) {
                    if (this.receipt[flagName].status === 'PASS') {
                        flagged.push('⚪')
                    } else {
                        flagged.push('🔴')
                        badFlagsCount++
                    }
                }
            })
            console.log('FROM:', this.parsedBody.from)
            content = (full ? content : (content.split('\n').slice(0, 4).join('\n') + '\n...'))
            if(badFlagsCount >= 3){
                content = '...'
            }
            console.log('body2', content)
            // console.log('this.parsedBody', JSON.stringify(this.parsedBody))
            console.log('this.metadata', this.metadata)
            var result = '✉️ <b>' + this.parsedBody.from[0].name + ' ('+ this.parsedBody.from[0].address + ')</b> \r\n' +
                '<i>' + this.parsedBody.subject + '</i>\r\n\r\n' +
                content +
                '\r\n🆔 ' + this.messageId + '.' + flagged.join(' ') +
                '\r\n📬<b>' + this.parsedBody.to[0].name + ' (' + this.parsedBody.to[0].address + ')</b>\r\n'
            console.log(chalk.green('result...'), chalk.green(result))
            console.log(chalk.blue(result.length))
        } catch (er) {
            console.log(er)
        }



        var blacklistEmailers = []
        var blacklistEmails = []
        blacklistEmailers.push(this.parsedBody.from[0].address.toLowerCase())
        if (this.parsedBody.replyTo) {
            blacklistEmailers.push(this.parsedBody.replyTo[0].address.toLowerCase())
        }
        console.log('blacklistEmailers', blacklistEmailers)


        blacklistEmailers.forEach((sourceEmail) => {
            if (sourceEmail.length < 33) {
                if (blacklistEmails.indexOf(sourceEmail) == -1) {
                    blacklistEmails.push(sourceEmail)
                }
            }

            if (blacklistEmails.indexOf(sourceEmail.split('@')[1]) == -1) {
                blacklistEmails.push(sourceEmail.split('@')[1])
            }
        })

        return { text: result, html: html, plain: body, blacklistEmails: blacklistEmails }
    }
}

module.exports = Email