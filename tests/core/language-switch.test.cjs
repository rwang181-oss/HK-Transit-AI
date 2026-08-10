const assert = require('node:assert/strict');
const language = require('../../.core-test-dist/utils/languageSwitch.js');

assert.equal(language.nextLanguage('en'), 'zh-HK');
assert.equal(language.nextLanguage('zh-HK'), 'en');
assert.equal(language.languageSwitchLabel('en'), '繁中');
assert.equal(language.languageSwitchLabel('zh-HK'), 'EN');

console.log('language-switch.test.cjs: PASS');
