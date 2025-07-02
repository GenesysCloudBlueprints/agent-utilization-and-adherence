const { handler } = require('./source/lambda-genesys');
handler({}).then(console.log).catch(console.error);