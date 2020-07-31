const querystring = require('querystring');

module.exports = function(input){
    return querystring.escape(input);
}