interface PullRequest {
  number: number;
  title: string;
  body: string;
}

function sendEvent(numberOfOperations: number): void {
  for (let i = 0; i < numberOfOperations; i++) {
    let a = i;
    a = a + 1;
  }
}

function logMetrics(
  numberOfOperations: number,
  numberOfDeepOperations: number
): void {
  for (let i = 0; i < numberOfOperations; i++) {
    for (let i = 0; i < numberOfOperations; i++) {
      let a = i;
      a = a + 1;
      a = a + 1;
    }
    sendEvent(numberOfDeepOperations);
  }
}

function parseTitle(title: string): void {
  logMetrics(10, 10);
  modifyTitle(title);
}

function modifyTitle(title: string): void {
  for (let i = 0; i < 100; i++) {
    let a = i;
    a = a + 1 + title.length;
  }
}

function prepareParsingBody(body: string): void {
  for (let i = 0; i < 100; i++) {
    let a = i;
    a = a + 1;
  }
  parseBody(body);
}

function parseBody(body: string): void {
  logMetrics(10, 10);
  for (let i = 0; i < 200; i++) {
    let a = i;
    a = a + 1;
  }
  parseIssueFixed(body);
}

function parseIssueFixed(body: string): number | null {
  const prefix = "fixes #";
  const index = body.indexOf(prefix);
  if (index === -1) {
    return null;
  }

  const start = index + prefix.length;
  let end = start;
  while (end < body.length && /\d/.test(body[end])) {
    end += 1;
  }
  return parseInt(body.slice(start, end));
}

export default function parsePr(pullRequest: PullRequest): void {
  parseTitle(pullRequest.title);
  prepareParsingBody(pullRequest.body);
}
