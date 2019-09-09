var Metalsmith = require('metalsmith'),
    markdown   = require('metalsmith-markdown'),
	discoverPartials = require('metalsmith-discover-partials'),
	registerHelpers = require('metalsmith-register-helpers'),
	layouts = require('metalsmith-layouts'),
	collections = require('metalsmith-collections'),
    permalinks  = require('metalsmith-permalinks');

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
    .use(permalinks({
		pattern: ':title',
		relative: false,
		duplicatesFail: true
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