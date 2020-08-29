module.exports = function (options) {
    if (!this.tagList) {
        return '';
    }

    const siteUrl = this.site.url;
    const itemsAsHtml = [];

    for (var tag in this.tagList) {
        let context = {
            name: tag,
            path: 'tag/' + this.tagList[tag].urlSafe + '/',
            count: this.tagList[tag].length,
            site: {
                url: siteUrl
            }
        };

        itemsAsHtml.push(options.fn(context));
    }

    return itemsAsHtml.join('');
}