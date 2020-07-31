var moment = require('moment');

module.exports = function(options) {
    return moment(this.date).format(options.hash.format);
}