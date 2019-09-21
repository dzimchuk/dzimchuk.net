var moment = require('moment');

module.exports = function(format) {
    return moment(this.date).format(format);
}