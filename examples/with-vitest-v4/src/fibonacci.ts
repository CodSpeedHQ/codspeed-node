export function recursiveFibonacci(n: number): number {
  if (n < 2) {
    return n;
  }
  return recursiveFibonacci(n - 1) + recursiveFibonacci(n - 2);
}

export function iterativeFibonacci(n: number): number {
  let a = 0;
  let b = 1;
  for (let i = 0; i < n; i++) {
    const temp = a + b;
    a = b;
    b = temp;
  }
  return a;
}
