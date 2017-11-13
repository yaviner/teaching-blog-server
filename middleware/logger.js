// Simple logger middleware
const moment = require('moment');

function log(req, res, next) {
    // Get the current time, format it like:
    // '07:56:22 10/17/2017'
    const now = moment().format('hh:mm:ss DD/MM/YYYY');
    // Then print out some request details to the console
    console.log(`${now}: ${req.method} ${req.originalUrl}`);
    // Let the next middleware in the chain run
    next();
}

// Export the log function
module.exports.log = log;