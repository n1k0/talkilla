var app = require('./server/server').app;
require('./server/presence');
require('./server/proxy');

app.start(process.env.PORT || 5000);
