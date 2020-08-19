var Handlebars = require('handlebars');

module.exports = {
    tags: function (options) {

        if (this.tags && this.tags.length > 0) {
            if (options.hash.plain) {
                return this.tags.map(element => element.name).join(', ');
            }
            else {
                var links = [];
                this.tags.forEach(element => {
                    links.push('<a href="/tag/' + element.slug + '/">' + Handlebars.escapeExpression(element.name) + '</a>');
                });

                var tagLinks = links.join(', ');

                var prefix = options.hash.prefix;
                if (prefix) {
                    tagLinks = prefix + tagLinks;
                }

                return new Handlebars.SafeString(tagLinks);
            }
        }

        return '';
    },
    hasTags: function () {
        return this.tags && this.tags.length > 0;
    }
}