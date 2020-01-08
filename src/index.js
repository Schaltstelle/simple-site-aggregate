'use strict'
const debug = require('debug')('aggregate')
const chalk = require('chalk')
const fs = require('fs')
const fse = require('fs-extra')
const path = require('path')
const request = require('request')
const cheerio = require('cheerio')
const moment = require('moment')
const ss = require('simple-site')
const yaml = require('js-yaml')

let parseFuncs = {}

registerParser('parseDate', (data, format) => {
    return moment(data, format).toDate()
})

ss.registerHelper('aggregate', run)

module.exports = {
    run: run,
    registerParser: registerParser
}

function registerParser(name, func) {
    parseFuncs[name] = func
}

/**
 * @param url The URL to fetch data
 * @param parser The parser file to use
 * @param templ The output template to use. May be an object {outputFile: template...}
 * @param config Additional data given to the template
 * @returns {*}
 */
function run(url, parser, templ, config) {
    return doRun(url, parser, templ, config ? config.hash : {})
}

function doRun(_url, _parser, _templ, config) {
    return resolveArgs(_url, _parser, _templ, config).then(params => {
        let [url, parserName, templ] = params
        let cacheDir = '_work/aggregate/' + (config.context || 'default')
        let dataDir = cacheDir + '/parsed'
        if (ss.configs.clean) {
            fse.removeSync(cacheDir)
        }
        fse.mkdirsSync(dataDir)
        debug('Searching', chalk.blue(url))
        let parser = findParser(parserName)
        let cache = path.resolve(cacheDir, filenameSafe(url))
        let doLoad = fs.existsSync(cache) ? readFile(cache) : load(url, ss.configs.outputDir, parser)
        return doLoad.then(data => {
            fs.writeFileSync(cache, data)
            let info = parse(url, data, parser, config.maxLen || 0)
            let context = Object.assign(info, config)
            fs.writeFileSync(path.resolve(dataDir, filenameSafe(url) + '.yaml'), yaml.safeDump(context))
            return execTemplate(fs.readFileSync(templ, 'utf8'), context)
        })
    })
}

function resolveArgs(url, parser, templ, config) {
    return Promise.all([
        ss.template(url, config).then(res => res.data),
        ss.template(parser, config).then(res => res.data),
        ss.template(templ, config).then(res => res.data)])
}

function execTemplate(file, context) {
    return ss.template(file, context).then(res => res.data)
}

function filenameSafe(s) {
    return s.replace(/[/\\:*?"<>|]/g, '-')
}

function readFile(file) {
    return new Promise((resolve, reject) => {
        fs.readFile(file, 'utf8', (err, data) => {
            if (err) {
                reject(err)
            } else {
                debug('Found', chalk.green(path.relative('', file)))
                resolve(data)
            }
        })
    })
}

let parsers = {}

function findParser(parser) {
    if (!parsers[parser]) {
        parsers[parser] = ss.loadYamlSync(fs.readFileSync(parser, 'utf8'))
    }
    return parsers[parser]
}

function load(addr, baseDir, parser, count) {
    if (count > 5) {
        return Promise.reject('Too many retries')
    }
    if (addr.substring(0, 4) !== 'http') {
        let filename = path.resolve(baseDir, addr)
        return retrying(readFile(filename))
    }
    return retrying(get(addr))

    function retrying(promise) {
        return promise
            .then(body => {
                let failContains = parser.fail && parser.fail.contains
                if (failContains && body.indexOf(failContains) >= 0) {
                    return Promise.reject('Contains "' + failContains + '"')
                }
                return body
            })
            .catch(err => {
                debug(chalk.blue(addr), chalk.red(err))
                return new Promise((resolve, reject) => {
                    setTimeout(() => resolve(load(addr, baseDir, parser, (count || 0) + 1)), 500)
                })
            })
    }
}

function parse(addr, data, template, maxLen) {
    const tags = cheerio.load(data)
    let info = Object.assign({url: addr}, template.static)
    for (let select in template.selectors) {
        let value = applySelector(addr, tags, template.selectors[select], maxLen)
        if (value != null) {
            info[select] = value
        }
    }
    return info
}

function applySelector(addr, tags, selector, maxLen) {
    if (Array.isArray(selector)) {
        let applied = selector.slice()
        applied[1] = extract(addr, tags, selector[1], maxLen)
        return parseFunc.apply(null, applied)
    }
    return extract(addr, tags, selector, maxLen)
}

function parseFunc(func, data, params) {
    let parser = parseFuncs[func]
    if (!parser) {
        debug(chalk.red('Ignoring unknown parse function ' + func))
        return data
    }
    return parser.apply(null, Array.prototype.slice.call(arguments, 1))
}

function extract(addr, tags, selector, maxLen) {
    let elem = /(.*?) \[(.*?)]$/.exec(selector)
    if (elem) {
        let css = elem[1]
        let attr = elem[2]
        let tag = tags(css)
        if (tag.length === 0) {
            debug(chalk.blue(addr), chalk.red('tag "' + css + '" not found.'))
            return null
        }
        if (attr.charAt(0) === '.') {
            return tag.hasClass(attr.substring(1))
        }
        let val = tag.attr(attr)
        if (!val) {
            debug(chalk.blue(addr), chalk.red('attribute "' + attr + '" not found on tag "' + css + '".'))
            return null
        }
        if (tag.get(0).tagName === 'img') {
            if (attr === 'src') {
                val = relative(val, addr)
            } else if (attr === 'srcset') {
                val = relative(val, addr) //TODO support it correctly
            }
        }
        return val
    }
    let tag = tags(selector)
    if (tag.length === 0) {
        debug(chalk.blue(addr), chalk.red('tag "' + selector + '" not found.'))
        return null
    }
    return convertToHtml(addr, tag, maxLen)
}

function convertToHtml(addr, elems, maxLen) {
    elems.find('a').each((i, e) => {
        let ee = cheerio(e)
        ee.attr('href', relative(ee.attr('href'), addr))
    })
    let val = elems.html()
    if (maxLen > 0 && val && val.length > maxLen) {
        let pos = val.indexOf('</p>', maxLen)
        if (pos > 0) {
            val = val.substring(0, pos + 4)
        }
    }
    return val
}

function relative(href, base) {
    let rel = href
    if (href && !href.match('^https?://')) {
        if (href.substring(0, 1) === '#') {
            rel = base + href
        } else if (href.substring(0, 1) === '/') {
            if (base.match('^https?://')) {
                let end = base.indexOf('/', 8)
                rel = base.substring(0, end < 0 ? base.length : end) + href
            } else {
                rel = href
            }
        } else {
            rel = base.substring(0, base.lastIndexOf('/') + 1) + href
        }
    }
    return path.normalize(rel).replace(/(https?:\/)([^/])/, '$1/$2')
}

function get(addr) {
    debug('Loading', chalk.green(addr))
    return new Promise((resolve, reject) => {
        let options = {
            url: addr,
            headers: {
                accept: 'text/html',
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36'
            }
        }
        request(options, (err, res, body) => {
            if (err) {
                reject(err)
            } else if (res.statusCode !== 200) {
                reject('Got response code ' + res.statusCode)
            } else {
                resolve(body)
            }
        })
    })
}
