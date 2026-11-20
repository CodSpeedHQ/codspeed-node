function makeIncrement() {
  const increment = (n: number) => n + 1;
  return increment;
}

console.log(await Promise.resolve(makeIncrement.toString()));
