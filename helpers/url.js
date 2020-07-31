module.exports = function(options){
    if (this.url){
        return this.url;
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
    return (absolute ? this.site.url : '') + '/' + path + '/';
}