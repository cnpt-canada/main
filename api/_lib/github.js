// Saving means committing.
//
// The page file is read from GitHub, the words are replaced, and the result is committed to the
// branch that deploys. Vercel builds that commit and about a minute later the new words *are* the
// page — there is no cache to clear and no store that can fall over, because the only thing holding
// the content is the repository the site is already built from.
//
// The write is conditional on the sha the file had when it was read, so a save can never land on
// top of a push it has not seen: GitHub refuses it and the editor is told to reload.
const API = 'https://api.github.com';

export function repoConfig() {
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  return { repo, token, branch: process.env.GITHUB_BRANCH || 'main' };
}

async function call(config, path, init) {
  const response = await fetch(API + path, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + config.token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'cnpt-site',
      ...(init && init.body ? { 'Content-Type': 'application/json' } : null)
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error('github ' + response.status + ': ' + (data.message || 'no message'));
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function readFile(config, file) {
  const data = await call(config, `/repos/${config.repo}/contents/${file}?ref=${encodeURIComponent(config.branch)}`);
  return { text: Buffer.from(String(data.content || ''), 'base64').toString('utf8'), sha: data.sha };
}

export async function writeFile(config, file, text, sha, message) {
  const data = await call(config, `/repos/${config.repo}/contents/${file}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      sha,
      branch: config.branch,
      content: Buffer.from(text, 'utf8').toString('base64'),
      // the studio's address, not the editor's: this repository is public and git history is forever.
      // Who made the edit is in the function log instead.
      author: { name: 'cnpt admin', email: 'info@cnpt.ca' }
    })
  });
  return data.commit && data.commit.sha ? data.commit.sha.slice(0, 7) : '';
}
