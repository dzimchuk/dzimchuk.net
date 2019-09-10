module.exports = function(words){
    var exp = /^\<p\>(.*)\<\/p\>$/;
    var excerpt = this.excerpt.replace(exp, '$1').trim();
    
    var splitted = excerpt.split(' ');
    if (splitted.length <= words)
    {
        return excerpt;
    }

    return splitted.splice(0, words).join(' ');
}