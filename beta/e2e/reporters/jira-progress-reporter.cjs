const fs = require('node:fs');
const path = require('node:path');

// The run configuration supplies its canonical absolute output path.
module.exports = class {
    constructor({ outputFile }) {
        this.outputFile = outputFile;
        this.count = 0;
    }

    onBegin(config, suite) {
        this.total = suite.allTests().length;
        fs.mkdirSync(path.dirname(this.outputFile), { recursive: true });
        fs.writeFileSync(this.outputFile, JSON.stringify({ event: 'begin', total: this.total, workers: config.workers }) + '\n');
        console.log('Running ' + this.total + ' browser cases');
    }

    onTestEnd(test, result) {
        this.count++;
        fs.appendFileSync(this.outputFile, JSON.stringify({
            event: 'result', count: this.count, title: test.titlePath(),
            status: result.status, duration: result.duration,
            error: result.error?.message?.slice(0, 1000),
        }) + '\n');
        if (this.count % 25 === 0) console.log('Completed ' + this.count + '/' + this.total);
    }

    onEnd(result) {
        console.log('Browser suite ' + result.status + '; completed ' + this.count);
    }
};
