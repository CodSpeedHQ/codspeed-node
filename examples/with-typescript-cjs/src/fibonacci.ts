export function recursiveFibonacci(n: number): number {
  if (n < 2) {
    return n;
  }
  return recursiveFibonacci(n - 1) + recursiveFibonacci(n - 2);
}

export function recursiveCachedFibonacci(n: number) {
  const cache: Record<number, number> = { 0: 0, 1: 1 };
  const fiboInner = (n: number) => {
    if (n in cache) {
      return cache[n];
    }
    cache[n] = fiboInner(n - 1) + fiboInner(n - 2);
    return cache[n];
  };
  return fiboInner(n);
}

export function iterativeFibonacci(n: number) {
  let a = 0;
  let b = 1;
  let c = 0;
  for (let i = 0; i < n; i++) {
    c = a + b;
    a = b;
    b = c;
  }
  return a;
}
