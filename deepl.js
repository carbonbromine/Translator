// deepl.js
const https = require('https');
const querystring = require('querystring');

function translateText(text, targetLang, apiKey) {
  return new Promise((resolve, reject) => {
    const postData = querystring.stringify({
      text: text,
      target_lang: targetLang
    });

    const options = {
      hostname: 'api-free.deepl.com',
      port: 443,
      path: '/v2/translate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`DeepL 翻译 API 返回状态 ${res.statusCode}`));
        }
        try {
          const json = JSON.parse(data);
          if (json.translations && json.translations.length > 0) {
            resolve(json.translations[0].text);
          } else {
            reject(new Error('DeepL 翻译返回数据格式异常'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', err => {
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

function queryUsage(apiKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api-free.deepl.com',
      port: 443,
      path: '/v2/usage',
      method: 'GET',
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`DeepL 用量查询返回状态 ${res.statusCode}`));
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', err => {
      reject(err);
    });

    req.end();
  });
}

module.exports = { translateText, queryUsage };
