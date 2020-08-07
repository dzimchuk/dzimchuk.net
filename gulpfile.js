var gulp = require('gulp');
var noop = require('gulp-noop');
var path = require('path');

var rev = require('gulp-rev');
var del = require('del');

var metalsmithFactory = require('./metalsmith.js');

var argv = require('minimist')(process.argv.slice(2));
var args = {
    build: !!argv.build,
    production: !!argv.production
  };

var site = require('./site');

// gulp plugins and utils
var concat = require('gulp-concat');
var uglify = require('gulp-uglify');
var sass = require('gulp-sass');
var postcss = require('gulp-postcss');

// postcss plugins
var autoprefixer = require('autoprefixer');
var colorFunction = require('postcss-color-function');
var cssnano = require('cssnano');
var customProperties = require('postcss-custom-properties');
var easyimport = require('postcss-easy-import');

gulp.task('metalsmith', function(callback){
    var ms = metalsmithFactory(args.production);
    ms.clean(false);

    ms.build(function(err, files) {
        if (err) {
          console.log(err);
          return callback(err);
        }
    
        callback();
    });
});

gulp.task('styles', function () {
    var processors = [
        easyimport,
        customProperties,
        colorFunction(),
        autoprefixer()
    ];

    if (args.production){
        processors.push(cssnano());
    }
    
    let outputDir = path.join(__dirname, site.config.destination.assets);
    del.sync(path.join(outputDir, '*.css'));

    return gulp.src(path.join(__dirname, site.config.source.styles, '**/*.scss'))
        .pipe(sass().on('error', sass.logError))
        .pipe(postcss(processors))
        .pipe(concat('theme.css'))
        .pipe(rev())
        .pipe(gulp.dest(outputDir))
        .pipe(rev.manifest(path.join(outputDir, 'rev-manifest.json'), {
            merge: true,
            base: outputDir 
         }))
        .pipe(gulp.dest(outputDir));
});

gulp.task('scripts', function() {
    let outputDir = path.join(__dirname, site.config.destination.assets);
    del.sync(path.join(outputDir, '*.js'));
    
    return gulp.src([path.join(__dirname, site.config.source.scripts, '*.js')])
        .pipe(args.production ? uglify() : noop())
        .pipe(concat('theme.js'))
        .pipe(rev())
        .pipe(gulp.dest(outputDir))
        .pipe(rev.manifest(path.join(outputDir, 'rev-manifest.json'), {
           merge: true,
           base: outputDir 
        }))
        .pipe(gulp.dest(outputDir));
});

gulp.task('watch', function () {
    gulp.watch(['gulpfile.js', 'site.js'], gulp.series('build'));
    gulp.watch(path.join(__dirname, site.config.source.styles, '**/*'), gulp.series('build'));
    gulp.watch(path.join(__dirname, site.config.source.scripts, '**/*'), gulp.series('build'));
    gulp.watch(['./metalsmith.js', './metadata.js', './partials.js', './author.json'], gulp.series('metalsmith'));
    gulp.watch([
        path.join(__dirname, site.config.source.content, '**/*'),
        path.join(__dirname, site.config.source.layouts, '**/*'),
        path.join(__dirname, site.config.source.helpers, '**/*')
      ], gulp.series('metalsmith'));
});

gulp.task('serve', function(callback) {
    var http = require('http');
    var serveStatic = require('serve-static');
    var finalhandler = require('finalhandler');

    var serve = serveStatic(site.config.destination.site, {
      "index": ['index.html', 'index.htm']
    });

    var server = http.createServer(function(req, res){
      var done = finalhandler(req, res);
      serve(req, res, done);
    })

    var serverPort = 8080;

    server.listen(serverPort, function() {
      console.log("Server: http://localhost:%s", serverPort);
      callback();
    });
});

gulp.task('build',  gulp.series('styles', 'scripts', 'metalsmith', function (done) {
  done();
}));

gulp.task('default',  gulp.series('build', 'watch', 'serve', function (done) {
    done();
}));
