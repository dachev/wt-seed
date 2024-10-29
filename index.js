#!/usr/bin/env node

try {
  var fs         = require('fs');
  var path       = require('path');
  var program    = require('commander');
  var colors     = require('colors');
  var _          = require('lodash');
  var request    = require('request');
  var httpRunner = null;
  var fileRunner = null;
  var TIMEOUT    = 60000;

  parseArguments(program);
}
catch (e) {
  console.error(e);
  console.error('Did you install dependencies? Run: npm install .');
  process.exit(1);
}

class ParallelTaskRunner {
  constructor(capacity, worker) {
    this.capacity = capacity;
    this.worker = worker;
    this.pendingTasks = [];
    this.runningTasks = [];
  }

  push(data, cb) {
    this.pendingTasks.push({
      data:data,
      cb:cb
    });
    this.run();
  };

  run() {
    if (this.runningTasks.length >= this.capacity) {
      return;
    }
    if (this.pendingTasks.length < 1) {
      return;
    }

    const item = this.pendingTasks.shift();
    this.runningTasks.push(item);

    this.worker(item.data, function(err, result) {
      item.cb(err, item.data, result);
      this.runningTasks = _.reject(this.runningTasks, item);
      this.run();
    }.bind(this));
  }
}

function main() {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  fs.closeSync(fs.openSync(program.outputFile, 'w'));

  httpRunner = new ParallelTaskRunner(10, fetchUrl);
  fileRunner = new ParallelTaskRunner(1, saveToFile);

  const data = +(new Date) + '\n';
  fs.appendFile(program.outputFile, data, function (err) {
    const plansUrl = program.baseUrl + '/workout-plans?summary_only=true&fetch_all=true';
    httpRunner.push(plansUrl, handleApiResponse);

    const exercisesUrl = program.baseUrl + '/exercises?summary=true&fetch_all=true';
    httpRunner.push(exercisesUrl, handleExercisesApiResponse);

    const settingsUrl = program.baseUrl + '/settings';
    httpRunner.push(settingsUrl, handleApiResponse);

    const musclesUrl = program.baseUrl + '/muscle_groups';
    httpRunner.push(musclesUrl, handleApiResponse);
  });
}

function fetchUrl(url, cb) {
  var options = {
    url: url,
    headers: {
      'CLIENT-VERSION': '5.0.0',
      'PLATFORM-NAME': 'ios'
    },
    timeout: TIMEOUT
  };

  request(options, function (err, response, body) {
    const json = body && JSON.parse(body);
    if (!err && response.statusCode != 200) {
      err = {message:'Unknown error'};
    }
    else if (!err && !json) {
      err = {message:'Unknown error'};
    }

    cb(err, json);
  });
}

function saveToFile(text, cb) {
  const data = text.length + ' ' + text + '\n';
  fs.appendFile(program.outputFile, data, function (err) {
    cb(err);
  });
}

function handleExercisesApiResponse(err, url, json) {
  if (err) {
    console.error(err.message.red);
    console.error(err);
    process.exit(1);
  }

  const body = JSON.stringify(json);
  fileRunner.push(url + ' ' + body, handleFileAppended);

  _.each(json, function(exercise) {
    const url = program.baseUrl + '/' + 'exercises/' + exercise.id;
    httpRunner.push(url, handleApiResponse);
  });

  console.log(body.length, url);
}

function handleApiResponse(err, url, json) {
  if (err) {
    console.error(err.message.red);
    console.error(err);
    process.exit(1);
  }

  const body = JSON.stringify(json);
  fileRunner.push(url + ' ' + body, handleFileAppended);

  console.log(body.length, url);
}

function handleFileAppended(err, text) {
  if (err) {
    console.error(err.message.red);
    console.error(err);
    process.exit(1);
  }
}

function parseArguments(program) {
  program
    .option('-b, --base-url <url>', 'base url')
    .option('-o, --output-file <file>', 'output file')
   .parse(process.argv);

  if (!program.baseUrl) {
    console.error('No base URL specified.'.red);
    process.exit(1);
  }
  if (!program.outputFile) {
    console.error('No output file specified.'.red);
    process.exit(1);
  }

  program.baseUrl = program.baseUrl.trim();
  if (program.baseUrl.indexOf('http') != 0) {
    console.error('Invalid base URL.'.red);
    process.exit(1);
  }
  program.baseUrl = program.baseUrl.replace(/t+$/, '');

  const outputDir = path.dirname(program.outputFile);
  if (fs.existsSync(outputDir) == false) {
    console.error('Output directory does not exist: '.red, program.outputFile);
    process.exit(1);
  }
}

main();


