const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

module.exports = class {
  constructor() { this.cases = []; this.run = process.env.CLOSEOUT_RUN || 'discovery'; }
  onBegin(config, suite) {
    this.total = suite.allTests().length;
    this.startedAt = new Date().toISOString();
    this.environment = { node: process.version, os: os.release(), platform: process.platform,
      workers: config.workers, projects: config.projects.map(project => ({
        name: project.name, retries: project.retries, use: project.use,
      })) };
    this.save('running');
    console.log(`[closeout:${this.run}] ${this.total} cases; one worker; retries=0`);
  }
  onTestEnd(test, result) {
    const attachments = result.attachments.map((attachment, index) => {
      let saved = attachment.path;
      if (!saved && attachment.body) {
        const folder = path.join(__dirname, 'inline-attachments', this.run);
        fs.mkdirSync(folder, { recursive: true });
        const id = crypto.createHash('sha256').update(test.id).digest('hex').slice(0, 16);
        saved = path.join(folder, `${id}-${index}.${attachment.contentType === 'application/json' ? 'json' : 'txt'}`);
        fs.writeFileSync(saved, attachment.body);
      }
      return { name: attachment.name, path: saved, contentType: attachment.contentType };
    });
    this.cases.push({ project: test.parent.project()?.name, title: test.title,
      titlePath: test.titlePath(), location: test.location, status: result.status,
      expectedStatus: test.expectedStatus, retry: result.retry, durationMs: result.duration,
      errors: result.errors.map(error => error.message), annotations: test.annotations,
      stdout: result.stdout.map(part => part.toString()).join('').slice(-15000), attachments });
    this.save('running');
    if (result.status !== 'passed' && result.status !== 'skipped') console.log(`FAIL ${test.title}\n${result.errors[0]?.message || ''}`);
    else if (this.cases.length % 10 === 0) console.log(`[closeout:${this.run}] ${this.cases.length}/${this.total}`);
  }
  save(status) {
    fs.writeFileSync(path.join(__dirname, `${this.run}.json`), JSON.stringify({
      status, total: this.total, startedAt: this.startedAt, updatedAt: new Date().toISOString(),
      environment: this.environment, cases: this.cases,
    }, null, 2));
  }
  onEnd(result) {
    this.save(result.status);
    const counts = this.cases.reduce((all, item) => { all[item.status] = (all[item.status] || 0) + 1; return all; }, {});
    console.log(`[closeout:${this.run}] ${result.status}: ${JSON.stringify(counts)}`);
  }
};
