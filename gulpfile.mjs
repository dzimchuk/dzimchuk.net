import {createRequire} from 'node:module';
import {existsSync, readdirSync, rmSync} from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import autoprefixer from 'autoprefixer';
import concat from 'gulp-concat';
import cssnano from 'cssnano';
import finalhandler from 'finalhandler';
import gulp from 'gulp';
import noop from 'gulp-noop';
import postcss from 'gulp-postcss';
import rev from 'gulp-rev';
import * as dartSass from 'sass';
import gulpSass from 'gulp-sass';
import uglify from 'gulp-uglify';
import minimist from 'minimist';
import serveStatic from 'serve-static';

const require = createRequire(import.meta.url);
const config = require('./config.js');
const metalsmithFactory = require('./metalsmith.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sass = gulpSass(dartSass);

const argv = minimist(process.argv.slice(2));
const args = {
    build: !!argv.build,
    production: !!argv.production
};

function cleanAssets(outputDir, extension) {
    if (!existsSync(outputDir)) {
        return;
    }

    readdirSync(outputDir)
        .filter(file => path.extname(file) === extension)
        .forEach(file => rmSync(path.join(outputDir, file), {force: true}));
}

gulp.task('metalsmith', function(callback) {
    const ms = metalsmithFactory(args.production);

    ms.build(function(err) {
        if (err) {
            console.log(err);
            return callback(err);
        }

        callback();
    });
});

gulp.task('styles', function() {
    const processors = [
        autoprefixer()
    ];

    if (args.production) {
        processors.push(cssnano());
    }

    const outputDir = path.join(__dirname, config.destination.assets);
    cleanAssets(outputDir, '.css');

    return gulp.src(path.join(__dirname, config.source.styles, '**/*.scss'))
        .pipe(sass().on('error', sass.logError))
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
    const outputDir = path.join(__dirname, config.destination.assets);
    cleanAssets(outputDir, '.js');

    return gulp.src([path.join(__dirname, config.source.scripts, '*.js')])
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

gulp.task('watch', function(callback) {
    gulp.watch(['gulpfile.mjs', 'config.js'], gulp.series('build'));
    gulp.watch(path.posix.join(config.source.styles, '**/*'), gulp.series('build'));
    gulp.watch(path.posix.join(config.source.scripts, '**/*'), gulp.series('build'));
    gulp.watch(['./metalsmith.js', './metadata.js', './partials.js', './auxiliaryPages.js', './plugins/**/*.js'], gulp.series('metalsmith'));
    gulp.watch([
        path.posix.join(config.source.content, '**/*.md'),
        path.posix.join(config.layouts, '**/*'),
        path.posix.join(config.helpers, '**/*'),
        config.metadata
    ], gulp.series('metalsmith'));

    callback();
});

gulp.task('serve', function(callback) {
    const serve = serveStatic(config.destination.site, {
        index: ['index.html', 'index.htm']
    });

    const server = http.createServer(function(req, res) {
        const done = finalhandler(req, res);
        serve(req, res, done);
    });

    const serverPort = 8080;

    server.listen(serverPort, function() {
        console.log('Server: http://localhost:%s', serverPort);
        callback();
    });
});

gulp.task('build', gulp.series('styles', 'scripts', 'metalsmith', function(done) {
    done();
}));

gulp.task('default', gulp.series('build', gulp.parallel('watch', 'serve'), function(done) {
    done();
}));
