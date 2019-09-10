var Metalsmith = require('metalsmith'),
    markdown   = require('metalsmith-markdown'),
	discoverPartials = require('metalsmith-discover-partials'),
	registerHelpers = require('metalsmith-register-helpers'),
	layouts = require('metalsmith-layouts'),
	collections = require('metalsmith-collections'),
	pagination = require('metalsmith-pagination'),
	permalinks  = require('metalsmith-permalinks'),
	excerpts = require('metalsmith-excerpts');

Metalsmith(__dirname)
	.metadata({
		site: {
			name: 'Andrei Dzimchuk',
			description: "I build solutions on Microsoft Azure and write about it here",
			lang: 'en'
		}
	})
	.source('./src')
    .destination('./build')
	.use(collections({
		pages: {
			pattern: 'content/pages/*.md'
		},
		posts: {
			pattern: 'content/posts/*.md',
			sortBy: 'date',
			reverse: true
		},
		home: {}
	}))
	.use(markdown())
	.use(excerpts())
    .use(permalinks({
		pattern: ':title',
		relative: false,
		duplicatesFail: true
	}))
	.use(pagination({
		'collections.posts': {
			perPage: 5,
		  	layout: 'index.hbs',
		    first: 'index.html',
		  	path: 'page/:num/index.html',
			pageMetadata: {
				isPageIndex: true
		  	}
		}
	}))
	.use(registerHelpers({
		directory: './helpers'
	}))
	.use(discoverPartials({
		directory: './layouts/partials',
		pattern: /\.hbs$/
	}))
	.use(layouts({
        engine: 'handlebars',
        directory: './layouts',
        default: 'post.hbs'
    }))
    .build(function (err, files) { if(err) console.log(err) });