# simple-site-aggregate
[![Build Status](https://travis-ci.org/Schaltstelle/simple-site-aggregate.svg?branch=master)](https://travis-ci.org/Schaltstelle/simple-site-aggregate)
[![codecov](https://codecov.io/gh/Schaltstelle/simple-site-aggregate/graph/badge.svg)](https://codecov.io/gh/Schaltstelle/simple-site-aggregate)
[![License](https://img.shields.io/badge/License-Apache%202.0-yellowgreen.svg)](https://opensource.org/licenses/Apache-2.0)

A [simple-site](https://github.com/Schaltstelle/simple-site) plugin that aggregates html snippets from other pages.

## Installation
Install with `npm install -g simple-site-aggregate`. 

Add `_plugins/index.js` containing the line `require('simple-site-aggregate');`.

## Usage
Aggregate a page using a handlebars tag:
```
{{{aggregate "http://my-site/my-page.html" "_parsers/my-site.json" "_templates/output.html" 300}}}
```

`http://my-site/my-page.html` is the page that should be aggregated.

`_parsers/my-site.json` defines how to extract data from the HTML file:
```json
{
    "selectors": {
        "title": "header.post-header h1",
        "content": "article.post-content",
        "image": ".blog-meta img [src]",
        "published": [
            "parseDate",
            "span.date",
            "DD.MM.YYYY"
        ]
    },
    "static": {
        "name": "My Name"
    }
}
```

The values in `selectors` are CSS selectors that are applied to the HTML file. 
The first matching tag is processed as follows:  
- If the value ends with a bracketed value (`.blog-meta img [src]`) the result is the value of an attribute (`src`).
- If the value ends with a bracketed dot value (`div [.left]`) the result is if the tag has the given CSS class.
- If the value is an array, the first entry is a parser function and the second entry a CSS selector. 
 The remaining entries are parameters to the parser function. 
 The result is the tag's content applied to the parser function. 
- Otherwise, the result is the content of the tag.
 
`static` contains static strings.

`_templates/output.html` is the template to be used to generate output.

`300` is an optional value defining the maximum length of the values.
 
