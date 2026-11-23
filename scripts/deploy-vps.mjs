import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('../',import.meta.url));
const head=execFileSync('git',['rev-parse','HEAD'],{cwd,encoding:'utf8'}).trim();
if(execFileSync('git',['status','--porcelain'],{cwd,encoding:'utf8'}).trim())throw Error('Commit and push the source before publishing.');
const remote=execFileSync('git',['ls-remote','origin','refs/heads/main'],{cwd,encoding:'utf8'}).trim().split(/\s+/)[0];
if(head!==remote)throw Error('Push this exact revision to main before publishing.');
// The server owns product data. Never replace it with a development snapshot.
execFileSync('ssh',['-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=15','atie','bash /usr/local/lib/hooya/hooya-sync.sh'],{cwd,stdio:'inherit'});
