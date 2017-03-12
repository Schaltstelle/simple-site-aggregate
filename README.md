# simple-site-aggregate
[![Build Status](https://travis-ci.org/Schaltstelle/simple-site-aggregate.svg?branch=master)](https://travis-ci.org/Schaltstelle/simple-site-aggregate)
[![codecov](https://codecov.io/gh/Schaltstelle/simple-site-aggregate/graph/badge.svg)](https://codecov.io/gh/Schaltstelle/simple-site-aggregate)
[![License](https://img.shields.io/badge/License-Apache%202.0-yellowgreen.svg)](https://opensource.org/licenses/Apache-2.0)

Aggregate html snippets from other pages.

## Usage
Install with `npm install -g html-aggregator`.

Run with `html-aggregator --templateDir=<directory> --output=<file> --maxLen=<number> input files...`.

`templateDir` contains json files that define how to extract data from HTML files:
````json
{
    "selectors": {
        "title": "header.post-header h1",
        "content": "article.post-content"
    },
    "static": {
        "name": "My Name"
    }
}
````

The values in `selectors` are CSS selectors that are applied to the input HTML files. `static` contains static strings.

`output` is a file defining how to render the scraped data:
````HTML
<h1>%title%</h1>
<div>By %name%</div>
<div>%content%</div>
````
The variables defined in a template are referenced by the expression`%var%`.

For every occurrence of `<aggregate url="..." template="..."></aggregate>` in every input file
- the contents of the given URL is fetched
- the contents is parsed with the given template
- if the input file name has the form `<name>.html.<ext>`  
  
  a new file `<name>.html` is created where all `<aggregate>`s are replaced by the `output` file having its variables replaced.
  
  Otherwise, `<aggregate>`'s child nodes are replaced with the `output` file having its variables replaced.
     