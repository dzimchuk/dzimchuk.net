const defaultDefinitions = {
    pages: {
        pattern: 'pages/**/*.md'
    },
    posts: {
        pattern: 'posts/**/*.md',
        sortBy: 'date',
        reverse: true
    }
};

function asArray(value) {
    if (value == null) {
        return [];
    }

    return Array.isArray(value) ? value.slice() : [value];
}

function normalizeDefinitions(definitions) {
    return Object.keys(definitions).reduce((result, name) => {
        const definition = definitions[name];
        result[name] = typeof definition === 'string' || Array.isArray(definition)
            ? { pattern: definition }
            : Object.assign({}, definition);

        return result;
    }, {});
}

function getValue(data, key) {
    if (typeof key === 'function') {
        return key(data);
    }

    return key.split('.').reduce((value, part) => value == null ? value : value[part], data);
}

function compareBy(sortBy) {
    return function(a, b) {
        a = getValue(a, sortBy);
        b = getValue(b, sortBy);

        if (!a && !b) {
            return 0;
        }

        if (!a) {
            return -1;
        }

        if (!b) {
            return 1;
        }

        if (b > a) {
            return -1;
        }

        if (a > b) {
            return 1;
        }

        return 0;
    };
}

function sortCollection(collection, definition) {
    if (typeof definition.sortBy === 'function' && definition.sortBy.length > 1) {
        collection.sort(definition.sortBy);
    }
    else if (definition.sortBy) {
        collection.sort(compareBy(definition.sortBy));
    }

    if (definition.reverse) {
        collection.reverse();
    }
}

function addCollection(data, name, collection) {
    data.collection = [...new Set(data.collection.concat(name))];
    collection.push(data);
}

function addReferences(collection) {
    const last = collection.length - 1;

    collection.forEach((file, index) => {
        if (index !== 0) {
            file.previous = collection[index - 1];
        }

        if (index !== last) {
            file.next = collection[index + 1];
        }
    });
}

module.exports = function collections(options) {
    const definitions = normalizeDefinitions(options || defaultDefinitions);
    const names = Object.keys(definitions);

    return function(files, metalsmith, done) {
        const metadata = metalsmith.metadata();
        const fileNames = Object.keys(files);
        const grouped = names.reduce((result, name) => {
            result[name] = [];
            return result;
        }, {});
        const matched = names.reduce((result, name) => {
            const pattern = definitions[name].pattern;
            result[name] = new Set(pattern ? metalsmith.match(pattern, fileNames) : []);
            return result;
        }, {});

        fileNames.forEach(file => {
            const data = files[file];
            const frontMatterCollections = asArray(data.collection);

            data.path = file;
            data.collection = frontMatterCollections;

            names.forEach(name => {
                if (matched[name].has(file) || frontMatterCollections.includes(name)) {
                    addCollection(data, name, grouped[name]);
                }
            });
        });

        names.forEach(name => {
            sortCollection(grouped[name], definitions[name]);

            if (definitions[name].refer !== false) {
                addReferences(grouped[name]);
            }

            metadata[name] = grouped[name];
        });

        metadata.collections = Object.assign({}, metadata.collections, grouped);

        done();
    };
};
