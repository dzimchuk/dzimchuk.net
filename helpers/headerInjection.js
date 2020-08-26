var Handlebars = require('handlebars');

module.exports = function (options) {
    if (!this.headerInjection) {
        return '';
    }

    var partial = Handlebars.partials[this.headerInjection];
    if (typeof partial !== 'function') {
        partial = Handlebars.compile(partial/*, { noEscape: true }*/);
    }
    return partial(this);
}