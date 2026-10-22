require('dotenv').config();
const express = require('express');
const https = require('https');
const fs = require('fs');

const app = express();
const port = process.env.PORT;

/*const options = {
    key: fs.readFileSync('./raidiohost-test.local-key.pem'),
    cert: fs.readFileSync('./raidiohost-test.local.pem')
};*/

require('./startup/db')();
require('./startup/config')(app);
require('./startup/routes')(app);

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});