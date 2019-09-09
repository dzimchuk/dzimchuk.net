var Handlebars = require('handlebars');

module.exports = function(asset){
    return new Handlebars.SafeString('/assets/' + asset + '?v=asset_hash');
}