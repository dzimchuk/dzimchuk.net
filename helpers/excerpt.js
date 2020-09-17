module.exports = function(options){
    var expParagrapgh = /^\<p\>(.*)\<\/p\>$/;
    var excerpt = this.excerpt.replace(expParagrapgh, '$1').trim();

    var expLinks = /\<a\s[^\>]+\>(.*?)\<\/a\>/g;
    excerpt = excerpt.replace(expLinks, '$1').trim();

    var words = options.hash.words;

    var splitted = excerpt.split(' ');
    if (splitted.length <= words)
    {
        return excerpt;
    }

    return splitted.splice(0, words).join(' ');
}