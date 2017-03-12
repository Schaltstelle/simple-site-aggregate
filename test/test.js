"use strict";

process.env.DEBUG = '*';

const assert = require('assert');
const fs = require('fs');
const fse = require('fs-extra');
const ss = require('simple-site');
const index = require('../src/index');

before(() => {
    ss.init({configDir: 'test'});
});

describe('aggregate', () => {
    it('should gather data from file', () => {
        fse.removeSync('test/cache');
        return index.run('../test/agg-input.html', 'file', 'test/agg-template.html').then(res => {
            assert.equal(res, fs.readFileSync('test/expected-file-agg.html', 'utf8'));
        });
    });
    it('should gather data from url', () => {
        fse.removeSync('test/cache');
        return index.run('http://en.wikipedia.org', 'wikipedia', 'test/agg-template.html').then(res => {
            assert.equal(res, fs.readFileSync('test/expected-url-agg.html', 'utf8'));
        });
    });
    it('should work as a helper', () => {
        fse.removeSync('test/cache');
        return ss.templateString('{{{aggregate "../test/agg-input.html" "file" "test/agg-template.html"}}}', {}).then(res => {
            assert.equal(res, fs.readFileSync('test/expected-file-agg.html', 'utf8'));
        });
    });
});
