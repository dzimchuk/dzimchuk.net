const url = require('url');

module.exports = function(){
    return 'https://feedly.com/i/subscription/feed/' + url.resolve(this.site.url, this.site.feedRss);
}