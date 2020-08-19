var moment = require('moment');

module.exports = function(options) {
    return moment(this.date).utc().format(options.hash.format);
}