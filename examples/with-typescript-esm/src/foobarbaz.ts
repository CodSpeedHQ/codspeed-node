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

// Async version
function dummyThingToAwait() {
  return new Promise<void>((resolve) => {
    process.nextTick(() => {
      resolve();
    });
  });
}

async function aFoo(n: number) {
  await dummyThingToAwait();
  let result = 0;
  for (let i = 0; i < n; i++) {
    result += 1;
  }
  return result;
}

async function aBar(n: number) {
  await dummyThingToAwait();
  await aFoo(n);
}

export async function aBaz(n: number) {
  await dummyThingToAwait();
  await aBar(n);
}
