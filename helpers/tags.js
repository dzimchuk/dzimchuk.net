var Handlebars = require('handlebars');

module.exports = function(prefix){
    var tagLinks = '';
    
    if (this.tags && this.tags.length > 0)
    {
        var links = [];
        this.tags.forEach(element => {
            links.push('<a href="/tag/' +  element.slug + '/">' + Handlebars.escapeExpression(element.name) + '</a>');
        });

        tagLinks = links.join(', ');
        if (prefix){
            tagLinks = prefix + tagLinks;
        }
    }

    return new Handlebars.SafeString(tagLinks);
}