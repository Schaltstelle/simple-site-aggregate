'use strict';
const debug = require('debug')('aggregate');
const chalk = require('chalk');
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const request = require('request');
const url = require('url');
const cheerio = require('cheerio');
const moment = require('moment');
const ss = require('simple-site');

let parseFuncs = {};

registerParser('parseDate', (data, format) => {
    return moment(data, format).toDate();
});

ss.registerHelper('aggregate', run);

module.exports = {
    run: run,
    registerParser: registerParser
};

function registerParser(name, func) {
    parseFuncs[name] = func;
}

function run(url, parser, templ, maxLen, config) {
    if (!config) {
        config = maxLen;
        maxLen = 0;
    }
    return doRun(url, parser, templ, maxLen, config ? config.hash : {});
}

function doRun(url, parser, templ, maxLen, config) {
    let cacheDir = '_work';
    if (ss.configs.clean) {
        fse.removeSync(cacheDir);
    }
    fse.mkdirsSync(cacheDir);
    const templateFile = fs.readFileSync(templ, 'utf8');
    debug('Searching', chalk.blue(url));
    let cache = path.resolve(cacheDir, filenameSafe(url));
    let doLoad = fs.existsSync(cache) ? readFile(cache) : load(url, ss.configs.outputDir);
    return doLoad.then(data => {
        fs.writeFileSync(cache, data);
        let info = parse(url, data, findParser(parser), maxLen);
        return ss.template(templateFile, Object.assign(info, config)).then(res => res.data);
    });
}

function filenameSafe(s) {
    return s.replace(/[/\\:*?"<>|]/g, '-');
}

function readFile(file) {
    return new Promise((resolve, reject) => {
        fs.readFile(file, 'utf8', (err, data) => {
            if (err) {
                reject(err);
            } else {
                debug('Found', chalk.green(path.relative('', file)));
                resolve(data);
            }
        })
    });
}

let parsers = {};
function findParser(parser) {
    if (!parsers[parser]) {
        parsers[parser] = ss.loadYamlSync(fs.readFileSync(parser, 'utf8'));
    }
    return parsers[parser];
}

function load(addr, baseDir, count) {
    if (count > 5) {
        return Promise.reject('Too many retries');
    }
    if (addr.substring(0, 4) !== 'http') {
        let filename = path.resolve(baseDir, addr);
        return retrying(readFile(filename));
    }
    return retrying(get(addr));

    function retrying(promise) {
        return promise.catch((err) => {
            debug(chalk.red(err));
            return new Promise((resolve, reject) => {
                setTimeout(() => resolve(load(addr, baseDir, (count || 0) + 1)), 500);
            });
        });
    }
}

function parse(addr, data, template, maxLen) {
    const tags = cheerio.load(data);
    let info = Object.assign({url: addr}, template.static);
    for (let select in template.selectors) {
        let value = applySelector(addr, tags, template.selectors[select], maxLen);
        if (value != null) {
            info[select] = value;
        }
    }
    return info;
}

function applySelector(addr, tags, selector, maxLen) {
    if (Array.isArray(selector)) {
        let applied = selector.slice();
        applied[1] = extract(addr, tags, selector[1], maxLen);
        return parseFunc.apply(null, applied);
    }
    return extract(addr, tags, selector, maxLen);
}

function parseFunc(func, data, params) {
    let parser = parseFuncs[func];
    if (!parser) {
        debug(chalk.red('Ignoring unknown parse function ' + func));
        return data;
    }
    return parser.apply(null, Array.prototype.slice.call(arguments, 1));
}

function extract(addr, tags, selector, maxLen) {
    let elem = /(.*?) \[(.*?)]$/.exec(selector);
    if (elem) {
        let css = elem[1];
        let attr = elem[2];
        let tag = tags(css);
        if (tag.length === 0) {
            debug(chalk.red('tag "' + css + '" not found.'));
            return null;
        }
        if (attr.charAt(0) === '.') {
            return tag.hasClass(attr.substring(1));
        }
        let val = tag.attr(attr);
        if (tag.get(0).tagName === 'img' && attr === 'src') {
            val = relative(val, addr);
        }
        return val;
    }
    let tag = tags(selector);
    if (tag.length === 0) {
        debug(chalk.red('tag "' + selector + '" not found.'));
        return null;
    }
    return convertToHtml(addr, tag, maxLen);
}

function convertToHtml(addr, elems, maxLen) {
    elems.find('a').each((i, e) => {
        let ee = cheerio(e);
        ee.attr('href', relative(ee.attr('href'), addr));
    });
    let val = elems.html();
    if (maxLen > 0 && val && val.length > maxLen) {
        let pos = val.indexOf('</p>', maxLen);
        if (pos > 0) {
            val = val.substring(0, pos + 4);
        }
    }
    return val;
}

function relative(href, base) {
    let rel = href;
    if (href && !href.match('^https?://')) {
        if (href.substring(0, 1) === '#') {
            rel = base + href;
        } else if (href.substring(0, 1) === '/') {
            rel = base.substring(0, base.indexOf('/', 8)) + href;
        } else {
            rel = base.substring(0, base.lastIndexOf('/') + 1) + href;
        }
    }
    return path.normalize(rel).replace(/(https?:\/)([^/])/, '$1/$2');
}

function get(addr) {
    debug('Loading', chalk.green(addr));
    return new Promise((resolve, reject) => {
        let options = {
            url: addr,
            headers: {
                accept: 'text/html',
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36'
            }
        };
        request(options, (err, res, body) => {
            if (err) {
                reject(err);
            } else if (res.statusCode !== 200) {
                reject('Got response code ' + res.statusCode);
            } else {
                resolve(body);
            }
        });
    });
}