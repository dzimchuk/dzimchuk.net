var Handlebars = require('handlebars');

module.exports = function(asset){
    var manifest = this['rev-manifest'];
    if (manifest && manifest[asset]){
        asset = manifest[asset];
    }
    return new Handlebars.SafeString('/assets/' + asset);
}