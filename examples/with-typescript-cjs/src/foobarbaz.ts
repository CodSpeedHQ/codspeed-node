// Sync version
function foo(n: number) {
  let result = 0;
  for (let i = 0; i < n; i++) {
    result += 1;
  }
  return result;
}

function bar(n: number) {
  foo(n);
}

export function baz(n: number) {
  bar(n);
}
