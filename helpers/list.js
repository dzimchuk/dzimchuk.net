module.exports = function (items, options) {
    const siteUrl = this.site.url;
    const itemsAsHtml = items.map(item => {
        item.site = {
            url: siteUrl
        };

        return options.fn(item);
    });
    return itemsAsHtml.join("");
}