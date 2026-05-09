module.exports = function(options){
    if (this.url){
        return this.url;
    }
    else if (this.permalink){
        return format.call(this, this.permalink, options.hash.absolute);
    }
    else if (this.path){
        var exp = /^(.*)index\.html$/;
        return format.call(this, this.path.replace(exp, '$1'), options.hash.absolute);
    }
    else{
        return '';
    }
}

function format(path, absolute){
    let result = absolute
        ? new URL(path, this.site.url).toString()
        : '/' + path.replace(/^\/+/, '');

    return result.endsWith('/') ? result : result + '/';
}
