## Clone and Setup
```
git clone https://github.com/PacoVu/voicemail_assistant
cd voicemail_assistant
$ npm install --save
$ cp dotenv .env
```

## Create a RingCentra app

Login at [developers.ringcentral.com](RingCentral developer portal) and create an app with the following parameters:

Application Type: Public
Platform Type: Browser-based
Permissions Needed: Read Account, SMS, Read Call Log
OAuth Redirect URI: http://localhost:8080/oauth2callback

If your app is hosted on a remote server, replace the "localhost" with the actual HTTP address!

Open the .env file and provide information for the following keys:

```
PGHOST=localhost
PGUSER=<username>
PGDATABASE=<database_name>
PGPASSWORD=<password>
PGPORT=5432

RC_CLIENT_ID_SB=<YourSandboxAppClientId>
RC_CLIENT_SECRET_SB=<YourSandboxAppClientSecret>

RC_CLIENT_ID_PROD=<YourProductionAppClientId>
RC_CLIENT_SECRET_PROD=<YourProductionAppClientSecret>

RC_APP_REDIRECT_URL=http://localhost:8080/oauth2callback
```

Sign up for other services to get their API keys.

•	MonkeyLearn developer account. (https://app.monkeylearn.com/accounts/register/)
•	Rev.ai developer account. (https://www.rev.ai/auth/signup)
•	WhitePages Pro (a.k.a Ekata) developer account. (https://ekata.com/developer/lp/start-api-trial)

Provide other API keys

```
MONKEYLEARN_APIKEY=<Your_Api_Key>
REVAI_APIKEY=<Your_Api_Key>
WHITEPAGE_PHONE_REPUTATION_APIKEY=<Your_Api_Key>
```

## Run the project

```
$ node index.js
```

- Open your Web browser and enter localhost:8080
- Choose an environment and login with a valid user's username and password. If you choose the Production for the environment, make sure that you have graduated the app created above.

## Add more users to the sandbox account

- Login your sandbox account at https://service.devtest.ringcentral.com
- Click "Add User" to add a new user and choose a direct number for the new user.
