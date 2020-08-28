var moment = require('moment');

module.exports = {
    date: function (options) {
        return formatDate(this.date, options);
    },
    now: function (options) {
        return formatDate(new Date(), options);
    }
}

function formatDate(date, options) {
    var format = options.hash.format || "YYYY-MM-DDTHH:mm:ss.SSSZ";
    return moment(date).utc().format(format);
}