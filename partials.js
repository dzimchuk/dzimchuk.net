var fs = require('fs');
var path = require('path');
var defaults = require('defaults');
var Handlebars = require('handlebars');

module.exports = function(options) {
    options = defaults(options, {
      directory: 'partials'
    });
    
    return function (files, metalsmith, done) {
        if (Array.isArray(options.directory)) {
            options.directory.forEach(function (dir) {
                processDirectory(metalsmith.path(dir));
            })
        }
        else {
            var dir = metalsmith.path(options.directory);
            processDirectory(dir);
        }

        done();
    };
}

function processDirectory(dir) {
    var regex = new RegExp(escapeRegExp(dir + path.sep) + '([^.]+).hbs$');

    var filelist = walkSync(dir);
    if (filelist.length > 0) {
        filelist.forEach(function (filename) {
            var matches = regex.exec(filename);
            if (!matches) {
                return;
            }
            var name = matches[1].replace(/\\/, '/');
            var template = fs.readFileSync(filename, 'utf8');
            Handlebars.registerPartial(name, template);
        });
    }
}

function escapeRegExp(string) {
  return string.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

const walkSync = (dir, filelist = []) => {
  fs.readdirSync(dir).forEach(file => {
    let fullName = path.join(dir, file);
    filelist = fs.statSync(fullName).isDirectory()
      ? walkSync(fullName, filelist)
      : filelist.concat(fullName);
  });
  return filelist;
}