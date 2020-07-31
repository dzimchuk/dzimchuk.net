var Handlebars = require('handlebars');

module.exports = function(options){
    var tagLinks = '';
    
    if (this.tags && this.tags.length > 0)
    {
        var links = [];
        this.tags.forEach(element => {
            links.push('<a href="/tag/' +  element.slug + '/">' + Handlebars.escapeExpression(element.name) + '</a>');
        });

        tagLinks = links.join(', ');
        
        var prefix = options.hash.prefix;
        if (prefix){
            tagLinks = prefix + tagLinks;
        }
    }

    return new Handlebars.SafeString(tagLinks);
}