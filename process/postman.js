class Postman {
    constructor(config) {
        this.sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(config.sendgridKey);
    }

    sendEmail(params) {
        return this.sgMail
            .send(data)
    }
}

module.exports = Postman