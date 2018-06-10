# serverless-email-telegram-bot
 
> Telegram Email Client for multiple domains, using AWS SES (Simple Email Service) and AWS Lambda

Self-hosted bot similar to @GmailBot

## Installation

### 1. Install Serverless

``` 
npm install -g serverless
```

### 2. Install Dependencies and Deploy to AWS Lambda

``` 
yarn install
sls deploy
```

- Check the URL automatically generated for the API Gateway and add it as `telegramHook` in config.json
- Check the public URL of the bucket and add it as `publicS3URL` in config.json, this url is used to see emails in html format and for downloading attachments bigger than 50Mb directly from s3. 

### 3. Make AWS SES receive the emails and call the lambda function

- Add your domain to [AWS verified-senders-domain](https://console.aws.amazon.com/ses/home?#verified-senders-domain:)
- Create a new *rule* in [receipt-rules](https://console.aws.amazon.com/ses/home?region=us-east-1#receipt-rules:) and in Actions, select `Lambda` and point to this function.

### Ready :)