require('dotenv-flow').config();
const express = require('express');
const { loadRuntimeConfig } = require('./config/runtime-config');

const runtimeConfig = loadRuntimeConfig();
const app = express();

/*const options = {
    key: fs.readFileSync('./raidiohost-test.local-key.pem'),
    cert: fs.readFileSync('./raidiohost-test.local.pem')
};*/

require('./startup/spotify').initialize(runtimeConfig.spotify);
require('./services/user.service').initializeTokenEncryption(runtimeConfig.tokens.encryptionKey);
require('./services/oauth-transaction.service').initialize(runtimeConfig.session.secret);
require('./services/session.service').initialize(runtimeConfig.session.secret);
require('./startup/db')(runtimeConfig);
require('./startup/config')(app, runtimeConfig);
require('./startup/routes')(app, runtimeConfig);

app.listen(runtimeConfig.server.port, () => {
    console.log(`Server is running on port ${runtimeConfig.server.port}`);
});
