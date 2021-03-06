const fs = require('fs');
const git = require('simple-git');
const common = require('./lib/common');

/**
 * Action to deploy openwhisk elements from a compliant repository
 *  @param {string} gitUrl - github url containing the manifest and elements to deploy
 *  @param {string} manifestPath - (optional) the path to the manifest file, e.g. "openwhisk/src"
 *  @param {object} envData - (optional) env details such as cloudant username or cloudant password
 *  @return {object} Promise
 */
function main(params) {
  const activationId = process.env.__OW_ACTIVATION_ID;
  // Grab optional envData and manifestPath params for wskdeploy
  let {
    envData,
    manifestPath,
    gitUrl
  } = params;

  // confirm gitUrl was provided as a parameter
  if (!gitUrl) {
    return sendError(400, new Error('Please enter the GitHub repo url in params'));
  }

  if (params.__ow_method === "post") {
    return new Promise((resolve, reject) => {
      // if no manifestPath was provided, use current directory
      if (!manifestPath) {
        manifestPath = '.';
      }
      // Grab wsp api host and auth from params, or process.env
      const { wskApiHost, wskAuth } = getWskApiAuth(params);

      // Extract the name of the repo for the tmp directory
      const tmpUrl = gitUrl.replace('https://', '');
      const repoSplit = tmpUrl.split('/');
      const repoOrg = repoSplit[1];
      const repoName = repoSplit[2];
      const localDirName = `${__dirname}/../tmp/${repoOrg}/${repoName}`;

      // any pre installed github repos should be a sibling to this package in "preInstalled" folder
      const templatesDirName = `${__dirname}/preInstalled/${repoOrg}/${repoName}`;

      if (fs.existsSync(templatesDirName)) {
        resolve({
          repoDir: templatesDirName,
          usingTemp: false,
          manifestPath,
          manifestFileName: 'manifest.yaml',
          wskAuth,
          wskApiHost,
          envData,
        });
      } else {
        return git().clone(gitUrl, localDirName, ['--depth', '1'], (err) => {
          if (err) {
            reject(new Error('There was a problem cloning from github.  Does that github repo exist?  Does it begin with http?'));
          }
          resolve({
            repoDir: localDirName,
            usingTemp: true,
            manifestPath,
            manifestFileName: 'manifest.yaml',
            wskAuth,
            wskApiHost,
            envData,
          });
        });
      }
    })
      .then(result => common.main(result))
      .then(success =>
        new Promise((resolve, reject) => {
          resolve({
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: Buffer.from(JSON.stringify({ status: success, activationId })).toString('base64'),
          });
        }))
      .catch(err => (sendError(400, err)));
  }
}

/**
 * Checks if wsk API host and auth were provided in params, if not, gets them from process.env
 * @param  {[Object]} params    [Params object]
 * @return {[Object]}           [Object containing wskApiHost and wskAuth]
 */
function getWskApiAuth(params) {
  let {
    wskApiHost,
    wskAuth,
  } = params;

  if (!wskApiHost) {
    wskApiHost = process.env.__OW_API_HOST;
  }

  if (!wskAuth) {
    wskAuth = process.env.__OW_API_KEY;
  }

  return {
    wskApiHost,
    wskAuth,
  };
}

function sendError(statusCode, err, message) {
  let error;
  if (err.message) {
    error = err.message;
  }
  const activationId = process.env.__OW_ACTIVATION_ID;
  const params = { error, activationId };
  if (message) {
    params.message = message;
  }
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: Buffer.from(JSON.stringify(params)).toString('base64'),
  };
}

exports.main = main;
