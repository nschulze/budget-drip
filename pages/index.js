const serverless = require(`serverless-http`);
const hbs = require(`hbs`);
const express = require(`express`);
const bodyParser = require(`body-parser`);
const path = require('path');
const plaid = require('plaid');
const dynamo = require('./util/dynamo');

const clientId = process.env.PLAID_CLIENT_ID;
const key = process.env.PLAID_KEY;
const secret = process.env.PLAID_SECRET;

const client = new plaid.Client(clientId, key, secret, plaid.environments.development)

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set(`view engine`, `hbs`);

app.get(`/main`, function(req, res) {
  dynamo.getInstitutions().then(result => {
    console.log(result.Items);
    res.status(200).render(`main`, {items: result.Items});
  });
});

app.post(`/access_token`, function(req, res) {
    var public_token = req.body.public_token;
    var metadata = req.body.metadata;
    client.exchangePublicToken(public_token, function(error, tokenResponse) {
    if (error != null) {
      console.log('Could not exchange public_token!' + '\n' + error);
      return res.json({error: msg});
    }
    var access_token = tokenResponse.access_token;
    var item_id = tokenResponse.item_id;

    dynamo.addInstitution(item_id, access_token, metadata.institution.name).then(result => {
      res.json({'success': 'true', 'institution': metadata.institution.name});
    });
    });
});

module.exports.handler = serverless(app);